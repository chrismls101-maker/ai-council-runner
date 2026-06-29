import type {
  GeneratedPathwayPayload,
  GeneratedPathwayStage,
  Pathway,
  PathwayStatus,
  Stage,
  StageStatus,
} from "./glassPathwaysTypes.ts";
import { normalizePathwayDomain } from "./glassPathwaysTypes.ts";
import {
  createPathwayId,
  defaultPathwayCapabilities,
  defaultPathwayContext,
} from "./glassPathwaysDefaults.ts";
import {
  attachStepsToStages,
  buildCompletionCriteria,
} from "./glassPathwaysSteps.ts";
import { asStringArray, sanitizeGuidanceArray } from "./glassPathwaysText.ts";
import { dispatchPathwayEvent } from "./glassPathwaysWorkflow.ts";

export { sanitizeGuidanceArray, asStringArray } from "./glassPathwaysText.ts";

function normalizeStage(
  pathwayId: string,
  raw: GeneratedPathwayStage,
  index: number,
): Stage | null {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const objective = typeof raw.objective === "string" ? raw.objective.trim() : "";
  const whyItMatters = typeof raw.whyItMatters === "string" ? raw.whyItMatters.trim() : "";
  if (!title || !objective || !whyItMatters) return null;

  const status: StageStatus =
    raw.status === "active" || raw.status === "completed" ? raw.status : "pending";

  const userActions = sanitizeGuidanceArray(asStringArray(raw.userActions));
  const whatToReview = sanitizeGuidanceArray(asStringArray(raw.whatToReview));

  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : createPathwayId("stage"),
    pathwayId,
    index: typeof raw.index === "number" && Number.isFinite(raw.index) ? raw.index : index,
    title,
    objective,
    whyItMatters,
    status,
    inputsNeeded: whatToReview,
    outputsRequired: [],
    dependencies: [],
    commonMistakes: sanitizeGuidanceArray(asStringArray(raw.commonMistakes)),
    suggestedResources: [],
    suggestedTools: [],
    completionCriteria: buildCompletionCriteria(raw, sanitizeGuidanceArray(asStringArray(raw.completionCriteria))),
    privacySensitivity: "low",
    stepIds: [],
    whatToReview,
    alethiaHelp: sanitizeGuidanceArray(asStringArray(raw.alethiaHelp)),
    userActions,
  };
}

export function parseGeneratedPathwayPayload(raw: string): GeneratedPathwayPayload | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;

    const p = parsed as Record<string, unknown>;
    const title = typeof p.title === "string" ? p.title.trim() : "";
    const summary = typeof p.summary === "string" ? p.summary.trim() : "";
    const domain = typeof p.domain === "string" ? p.domain.trim() : "";
    if (!title || !summary || !Array.isArray(p.stages)) return null;

    const stages: GeneratedPathwayStage[] = [];
    for (const item of p.stages) {
      if (typeof item !== "object" || item === null) continue;
      stages.push(item as GeneratedPathwayStage);
    }
    if (stages.length < 5 || stages.length > 12) return null;

    return { title, summary, domain: domain || "general", stages };
  } catch {
    return null;
  }
}

export function buildGlassPathwayFromPayload(
  goal: string,
  payload: GeneratedPathwayPayload,
  status: PathwayStatus = "ready",
): Pathway | null {
  const pathwayId = createPathwayId("pathway");
  const baseStages: Stage[] = [];

  payload.stages.forEach((raw, i) => {
    const stage = normalizeStage(pathwayId, raw, i + 1);
    if (stage) baseStages.push({ ...stage, index: i + 1 });
  });

  if (baseStages.length < 5) return null;

  const { stages, steps } = attachStepsToStages(pathwayId, baseStages, payload.stages);
  const now = new Date().toISOString();
  const title = payload.title.trim();
  const summary = payload.summary.trim();

  const pathway: Pathway = {
    id: pathwayId,
    goal: goal.trim(),
    domain: normalizePathwayDomain(payload.domain),
    title,
    summary,
    status,
    stages,
    steps,
    currentStageId: null,
    currentStepId: null,
    context: defaultPathwayContext(goal, title, summary),
    capabilities: defaultPathwayCapabilities(),
    audit: [],
    checkpoints: [],
    pendingGate: null,
    pendingHandoff: null,
    createdAt: now,
    updatedAt: now,
  };

  return dispatchPathwayEvent(pathway, { type: "PATHWAY_CREATED", pathway });
}

export function parseGeneratedPathway(goal: string, raw: string): Pathway | null {
  const payload = parseGeneratedPathwayPayload(raw);
  if (!payload) return null;
  return buildGlassPathwayFromPayload(goal, payload);
}
