/**
 * Glass Pathways — audit receipts and narrative (canonical ExecutionReceipt).
 */

import type {
  ExecutionReceipt,
  Pathway,
  PathwayLiveSession,
  Stage,
  Step,
} from "./glassPathwaysTypes.ts";
import { stepsForStage } from "./glassPathwaysTypes.ts";
import { resolveFocusStage, resolveFocusStep } from "./glassPathwaysGuidance.ts";
import { pathwayConnectorById } from "./glassPathwaysConnectors.ts";
import { createExecutionReceipt } from "./glassPathwaysWorkflow.ts";

const MAX_AUDIT = 80;

/** @deprecated Use createExecutionReceipt */
export function createPathwayReceipt(
  input: Omit<ExecutionReceipt, "id" | "timestamp">,
): ExecutionReceipt {
  return createExecutionReceipt(input);
}

export function appendPathwayAudit(
  pathway: Pathway,
  receipts: ExecutionReceipt[],
): Pathway {
  return {
    ...pathway,
    audit: [...pathway.audit, ...receipts].slice(-MAX_AUDIT),
  };
}

/** @deprecated Use appendPathwayAudit */
export function appendPathwayReceipts(
  pathway: Pathway,
  receipts: ExecutionReceipt[],
): Pathway {
  return appendPathwayAudit(pathway, receipts);
}

export function formatReceiptTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function buildPathwayNarrativeSummary(
  pathway: Pathway,
  liveSession: PathwayLiveSession | null,
): string {
  const focus = resolveFocusStage(pathway);
  const focusStep = resolveFocusStep(pathway);
  const completed = pathway.stages.filter((s) => s.status === "completed").length;
  const total = pathway.stages.length;

  if (pathway.status === "privacy_handoff") {
    return `Privacy handoff — ${completed}/${total} stages done.`;
  }
  if (pathway.status === "operator_running") {
    return `Operator running — ${completed}/${total} stages done.`;
  }
  if (pathway.status === "paused") {
    return `Paused — ${completed}/${total} stages done.`;
  }

  if (liveSession?.pathwayId === pathway.id) {
    const stage = pathway.stages.find((s) => s.id === liveSession.stageId);
    const stageLabel = stage ? `Stage ${stage.index}` : "this stage";
    switch (liveSession.mode) {
      case "privacy":
        return `Paused for privacy on ${stageLabel} — ${completed}/${total} stages done.`;
      case "execution":
        return `Controlled execution active on ${stageLabel} — ${completed}/${total} stages done.`;
      case "connector": {
        const connector = liveSession.connectorId
          ? pathwayConnectorById(liveSession.connectorId)
          : undefined;
        return `${connector?.label ?? "Connector"} on ${stageLabel} — ${completed}/${total} stages done.`;
      }
      case "observe":
        return `Observing and guiding on ${stageLabel} — ${completed}/${total} stages done.`;
      case "escort":
        return `Escort mode on ${stageLabel} — ${completed}/${total} stages done.`;
    }
  }

  if (focusStep) {
    return `Focus: Step ${focusStep.index} (${focusStep.mode}) · ${completed}/${total} stages`;
  }

  if (focus) {
    return `Focus: Stage ${focus.index} · ${completed}/${total} complete`;
  }

  if (completed === total) return "Pathway complete.";
  return `${completed}/${total} stages complete`;
}

export function recentPathwayReceipts(
  pathway: Pathway,
  limit = 5,
): ExecutionReceipt[] {
  return pathway.audit.slice(-limit).reverse();
}

export function checkpointReceiptLabel(stage: Stage, step?: Step): string {
  if (step) return `Checkpoint: Stage ${stage.index}, Step ${step.index}`;
  return `Checkpoint: Stage ${stage.index}`;
}

/** Bridge live session end to audit receipt for tests. */
export function receiptFromLiveSession(
  session: PathwayLiveSession,
  outcome: "started" | "ended" | "abandoned",
): ExecutionReceipt {
  const kind =
    session.mode === "privacy"
      ? outcome === "started"
        ? "privacy_handoff_entered"
        : "privacy_handoff_resumed"
      : session.mode === "execution"
        ? outcome === "started"
          ? "operator_started"
          : "operator_completed"
        : outcome === "started"
          ? "step_started"
          : "step_completed";

  return createExecutionReceipt({
    pathwayId: session.pathwayId,
    stageId: session.stageId,
    stepId: session.stepId,
    kind,
    summary: `${session.mode} ${outcome}`,
    metadata: {
      mode: session.mode,
      targetLabel: session.targetLabel,
      outcome,
    },
  });
}

export function stepProgressForStage(pathway: Pathway, stageId: string): string | null {
  const steps = stepsForStage(pathway, stageId);
  if (steps.length === 0) return null;
  const done = steps.filter((s) => s.status === "completed").length;
  return `${done}/${steps.length} steps`;
}
