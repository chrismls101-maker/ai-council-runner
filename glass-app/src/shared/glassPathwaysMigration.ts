/**
 * Glass Pathways — migrate V1 stage-only pathways to canonical schema.
 */

import {
  createPathwayId,
  defaultPathwayCapabilities,
  defaultPathwayContext,
} from "./glassPathwaysDefaults.ts";
import { attachStepsToStages, buildCompletionCriteria } from "./glassPathwaysSteps.ts";
import type {
  ExecutionReceipt,
  Pathway,
  PathwayDomain,
  PathwayRuntimeReceipt,
  PathwayStatus,
  Stage,
  StageStatus,
} from "./glassPathwaysTypes.ts";
import { normalizePathwayDomain } from "./glassPathwaysTypes.ts";
import { createExecutionReceipt } from "./glassPathwaysWorkflow.ts";

/** Legacy V1 pathway shape (pre-canonical). */
export interface LegacyGlassPathway {
  id: string;
  goal: string;
  title: string;
  summary: string;
  domain: string;
  status: PathwayStatus;
  stages: LegacyGlassPathwayStage[];
  currentStageId: string | null;
  createdAt: string;
  updatedAt: string;
  runtimeReceipts?: PathwayRuntimeReceipt[];
}

interface LegacyGlassPathwayStage {
  id: string;
  index: number;
  title: string;
  objective: string;
  whyItMatters: string;
  whatToReview?: string[];
  commonMistakes?: string[];
  alethiaHelp?: string[];
  userActions?: string[];
  completionCriteria?: string[] | { id: string; description: string; required: boolean }[];
  status: StageStatus;
  substepDone?: boolean[];
}

function migrateReceipts(legacy: LegacyGlassPathway): ExecutionReceipt[] {
  const receipts = legacy.runtimeReceipts ?? [];
  return receipts.map((r) => {
    const kindMap: Record<string, ExecutionReceipt["kind"]> = {
      escort: "step_started",
      privacy_start: "privacy_handoff_entered",
      privacy_end: "privacy_handoff_resumed",
      execution_start: "operator_started",
      execution_end: "operator_completed",
      connector: "step_started",
      observe: "step_started",
      checkpoint: "checkpoint_created",
      stage_active: "stage_started",
      stage_complete: "stage_completed",
    };
    return createExecutionReceipt({
      pathwayId: legacy.id,
      stageId: r.stageId,
      kind: kindMap[r.kind] ?? "step_started",
      summary: r.label,
      metadata: r.detail ? { detail: r.detail, legacyKind: r.kind } : { legacyKind: r.kind },
    });
  });
}

function normalizeLegacyCriteria(
  raw: LegacyGlassPathwayStage["completionCriteria"],
): Stage["completionCriteria"] {
  if (!raw || raw.length === 0) return [];
  if (typeof raw[0] === "string") {
    return buildCompletionCriteria(undefined, raw as string[]);
  }
  return raw as Stage["completionCriteria"];
}

export function migrateLegacyPathway(legacy: LegacyGlassPathway): Pathway {
  const pathwayId = legacy.id;
  const domain = normalizePathwayDomain(legacy.domain) as PathwayDomain;

  const baseStages: Stage[] = legacy.stages.map((s) => ({
    id: s.id,
    pathwayId,
    index: s.index,
    title: s.title,
    objective: s.objective,
    whyItMatters: s.whyItMatters,
    status: s.status === "active" || s.status === "completed" ? s.status : "pending",
    inputsNeeded: s.whatToReview ?? [],
    outputsRequired: [],
    dependencies: [],
    commonMistakes: s.commonMistakes ?? [],
    suggestedResources: [],
    suggestedTools: [],
    completionCriteria: normalizeLegacyCriteria(s.completionCriteria),
    privacySensitivity: "low" as const,
    stepIds: [],
    whatToReview: s.whatToReview,
    alethiaHelp: s.alethiaHelp,
    userActions: s.userActions,
    substepDone: s.substepDone,
  }));

  const { stages, steps } = attachStepsToStages(pathwayId, baseStages);

  let currentStepId: string | null = null;
  if (legacy.currentStageId) {
    const stage = stages.find((s) => s.id === legacy.currentStageId);
    currentStepId = stage?.stepIds[0] ?? null;
    for (let i = 0; i < (stage?.substepDone?.length ?? 0); i += 1) {
      if (stage?.substepDone?.[i] && stage.stepIds[i]) {
        const step = steps.find((st) => st.id === stage.stepIds[i]);
        if (step) step.status = "completed";
      }
    }
  }

  const audit = migrateReceipts(legacy);

  return {
    id: pathwayId,
    goal: legacy.goal,
    domain,
    title: legacy.title,
    summary: legacy.summary,
    status: legacy.status,
    currentStageId: legacy.currentStageId,
    currentStepId,
    stages,
    steps,
    context: defaultPathwayContext(legacy.goal, legacy.title, legacy.summary),
    capabilities: defaultPathwayCapabilities(),
    audit,
    checkpoints: [],
    pendingGate: null,
    pendingHandoff: null,
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
  };
}

export function isLegacyPathway(value: unknown): value is LegacyGlassPathway {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === "string"
    && Array.isArray(p.stages)
    && !Array.isArray(p.steps)
    && p.context === undefined
  );
}

export function ensureCanonicalPathway(value: unknown): Pathway | null {
  if (typeof value !== "object" || value === null) return null;
  const p = value as Record<string, unknown>;
  if (Array.isArray(p.stages)) {
    if (isLegacyPathway(value)) {
      return migrateLegacyPathway(value);
    }
    if (Array.isArray(p.steps)) {
      const pathway = value as Pathway;
      return {
        ...pathway,
        context: pathway.context ?? defaultPathwayContext(pathway.goal, pathway.title, pathway.summary),
        capabilities: pathway.capabilities ?? defaultPathwayCapabilities(),
        audit: Array.isArray(pathway.audit) ? pathway.audit : [],
        checkpoints: Array.isArray(pathway.checkpoints) ? pathway.checkpoints : [],
        pendingGate: pathway.pendingGate ?? null,
        pendingHandoff: pathway.pendingHandoff ?? null,
      };
    }
  }
  return null;
}

export function createEmptyPathwayDraft(goal: string): Pathway {
  const now = new Date().toISOString();
  const id = createPathwayId("pathway");
  return {
    id,
    goal: goal.trim(),
    domain: "custom",
    title: "",
    summary: "",
    status: "drafting",
    currentStageId: null,
    currentStepId: null,
    stages: [],
    steps: [],
    context: defaultPathwayContext(goal, "", ""),
    capabilities: defaultPathwayCapabilities(),
    audit: [],
    checkpoints: [],
    pendingGate: null,
    pendingHandoff: null,
    createdAt: now,
    updatedAt: now,
  };
}
