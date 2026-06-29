/**
 * Glass Pathways — workflow reducer (canonical state machine).
 * See docs/architecture/GLASS_PATHWAYS.md §4.
 */

import { createPathwayId } from "./glassPathwaysDefaults.ts";
import type {
  Checkpoint,
  ExecutionReceipt,
  Pathway,
  PathwayStatus,
  PrivacyHandoff,
  Stage,
  StageStatus,
  Step,
  StepStatus,
  WorkflowEvent,
} from "./glassPathwaysTypes.ts";
import {
  findStage,
  findStep,
  stepsForStage,
} from "./glassPathwaysTypes.ts";

const MAX_AUDIT = 80;
const MAX_CHECKPOINTS = 24;

export function createExecutionReceipt(
  input: Omit<ExecutionReceipt, "id" | "timestamp">,
): ExecutionReceipt {
  return {
    ...input,
    id: createPathwayId("receipt"),
    timestamp: new Date().toISOString(),
  };
}

function touch(pathway: Pathway): Pathway {
  return { ...pathway, updatedAt: new Date().toISOString() };
}

function appendAudit(pathway: Pathway, receipt: ExecutionReceipt): Pathway {
  return {
    ...pathway,
    audit: [...pathway.audit, receipt].slice(-MAX_AUDIT),
  };
}

function updateStage(pathway: Pathway, stageId: string, patch: Partial<Stage>): Pathway {
  return {
    ...pathway,
    stages: pathway.stages.map((s) => (s.id === stageId ? { ...s, ...patch } : s)),
  };
}

function updateStep(pathway: Pathway, stepId: string, patch: Partial<Step>): Pathway {
  return {
    ...pathway,
    steps: pathway.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
  };
}

function demoteOtherActiveStages(pathway: Pathway, activeStageId: string): Pathway {
  return {
    ...pathway,
    stages: pathway.stages.map((s) => {
      if (s.id === activeStageId) return s;
      if (s.status === "active" || s.status === "privacy_handoff") {
        return { ...s, status: "pending" as StageStatus };
      }
      return s;
    }),
  };
}

function firstPendingStep(pathway: Pathway, stageId: string): Step | null {
  return stepsForStage(pathway, stageId).find((s) => s.status !== "completed") ?? null;
}

function allStagesCompleted(pathway: Pathway): boolean {
  return pathway.stages.length > 0 && pathway.stages.every((s) => s.status === "completed");
}

function allStepsInStageCompleted(pathway: Pathway, stageId: string): boolean {
  const steps = stepsForStage(pathway, stageId);
  return steps.length > 0 && steps.every((s) => s.status === "completed");
}

export function createCheckpoint(
  pathway: Pathway,
  reason: Checkpoint["reason"],
  stageId: string | null,
  stepId: string | null,
  note?: string,
): Checkpoint {
  const stage = stageId ? findStage(pathway, stageId) : null;
  const step = stepId ? findStep(pathway, stepId) : null;
  return {
    id: createPathwayId("checkpoint"),
    pathwayId: pathway.id,
    stageId,
    stepId,
    statusSnapshot: {
      pathwayStatus: pathway.status,
      stageStatus: stage?.status,
      stepStatus: step?.status,
    },
    contextSnapshot: structuredClone(pathway.context),
    pendingGateId: pathway.pendingGate?.id,
    pendingHandoffId: pathway.pendingHandoff?.id,
    createdAt: new Date().toISOString(),
    reason,
    note,
  };
}

function appendCheckpoint(pathway: Pathway, checkpoint: Checkpoint): Pathway {
  return {
    ...pathway,
    checkpoints: [...pathway.checkpoints, checkpoint].slice(-MAX_CHECKPOINTS),
  };
}

export function pathwayReducer(pathway: Pathway, event: WorkflowEvent): Pathway {
  switch (event.type) {
    case "PATHWAY_CREATED": {
      return touch(
        appendAudit(event.pathway, createExecutionReceipt({
          pathwayId: event.pathway.id,
          kind: "pathway_created",
          summary: `Pathway created: ${event.pathway.title}`,
        })),
      );
    }

    case "PATHWAY_CONFIRMED": {
      if (pathway.id !== event.pathwayId) return pathway;
      return touch({ ...pathway, status: "ready" });
    }

    case "STAGE_START": {
      if (pathway.id !== event.pathwayId) return pathway;
      const stage = findStage(pathway, event.stageId);
      if (!stage) return pathway;

      let next = demoteOtherActiveStages(pathway, event.stageId);
      const now = new Date().toISOString();
      next = updateStage(next, event.stageId, {
        status: "active",
        startedAt: stage.startedAt ?? now,
      });

      const step = firstPendingStep(next, event.stageId);
      if (step) {
        next = updateStep(next, step.id, { status: "active", startedAt: step.startedAt ?? now });
        next = { ...next, currentStageId: event.stageId, currentStepId: step.id };
        next = appendAudit(next, createExecutionReceipt({
          pathwayId: pathway.id,
          stageId: event.stageId,
          stepId: step.id,
          kind: "step_started",
          summary: `Step ${step.index} started`,
          metadata: { mode: step.mode },
        }));
      } else {
        next = { ...next, currentStageId: event.stageId, currentStepId: null };
      }

      if (next.status === "ready" || next.status === "drafting" || next.status === "awaiting_confirmation") {
        next = { ...next, status: "active" };
      }

      next = appendAudit(next, createExecutionReceipt({
        pathwayId: pathway.id,
        stageId: event.stageId,
        kind: "stage_started",
        summary: `Stage ${stage.index} started: ${stage.title}`,
      }));

      return touch(next);
    }

    case "STEP_START": {
      if (pathway.id !== event.pathwayId) return pathway;
      const step = findStep(pathway, event.stepId);
      if (!step) return pathway;
      const now = new Date().toISOString();
      let next = updateStep(pathway, event.stepId, {
        status: step.status === "pending" ? "active" : step.status,
        startedAt: step.startedAt ?? now,
      });
      next = { ...next, currentStageId: event.stageId, currentStepId: event.stepId };
      if (pathway.status === "ready") next = { ...next, status: "active" };
      next = appendAudit(next, createExecutionReceipt({
        pathwayId: pathway.id,
        stageId: event.stageId,
        stepId: event.stepId,
        kind: "step_started",
        summary: `Step ${step.index}: ${step.description.slice(0, 80)}`,
        metadata: { mode: step.mode },
      }));
      return touch(next);
    }

    case "STEP_COMPLETE": {
      if (pathway.id !== event.pathwayId) return pathway;
      const step = findStep(pathway, event.stepId);
      if (!step || step.status === "completed") return pathway;
      const now = new Date().toISOString();
      let next = updateStep(pathway, event.stepId, {
        status: "completed",
        completedAt: now,
      });

      const stage = findStage(next, event.stageId);
      if (stage) {
        const stepIndex = step.index - 1;
        const substepDone = [...(stage.substepDone ?? [])];
        while (substepDone.length <= stepIndex) substepDone.push(false);
        substepDone[stepIndex] = true;
        next = updateStage(next, event.stageId, { substepDone });
      }

      next = appendAudit(next, createExecutionReceipt({
        pathwayId: pathway.id,
        stageId: event.stageId,
        stepId: event.stepId,
        kind: "step_completed",
        summary: `Step ${step.index} completed`,
      }));

      const checkpoint = createCheckpoint(next, "after_step_complete", event.stageId, event.stepId);
      next = appendCheckpoint(next, checkpoint);
      next = appendAudit(next, createExecutionReceipt({
        pathwayId: pathway.id,
        stageId: event.stageId,
        stepId: event.stepId,
        kind: "checkpoint_created",
        summary: checkpoint.note ?? `Checkpoint after step ${step.index}`,
      }));

      if (allStepsInStageCompleted(next, event.stageId)) {
        next = updateStage(next, event.stageId, { status: "completed", completedAt: now });
        next = appendAudit(next, createExecutionReceipt({
          pathwayId: pathway.id,
          stageId: event.stageId,
          kind: "stage_completed",
          summary: `Stage ${stage?.index ?? ""} completed`,
        }));
        if (allStagesCompleted(next)) {
          next = {
            ...next,
            status: "completed",
            completedAt: now,
            currentStageId: null,
            currentStepId: null,
          };
          next = appendAudit(next, createExecutionReceipt({
            pathwayId: pathway.id,
            kind: "pathway_completed",
            summary: "Pathway completed",
          }));
        } else {
          const nextStep = firstPendingStep(next, event.stageId);
          const nextStage = next.stages.find(
            (s) => s.status !== "completed" && s.id !== event.stageId,
          );
          next = {
            ...next,
            currentStageId: nextStage?.id ?? event.stageId,
            currentStepId: nextStep?.id ?? null,
          };
        }
      } else {
        const following = stepsForStage(next, event.stageId).find((s) => s.status !== "completed");
        next = { ...next, currentStepId: following?.id ?? null };
      }

      return touch(next);
    }

    case "CHECKPOINT_CREATE": {
      if (pathway.id !== event.pathwayId) return pathway;
      const checkpoint = createCheckpoint(
        pathway,
        event.reason,
        event.stageId,
        event.stepId ?? null,
        event.note,
      );
      let next = appendCheckpoint(pathway, checkpoint);
      next = appendAudit(next, createExecutionReceipt({
        pathwayId: pathway.id,
        stageId: event.stageId,
        stepId: event.stepId,
        kind: "checkpoint_created",
        summary: event.note ?? `Checkpoint: ${event.reason}`,
      }));
      return touch(next);
    }

    case "PATHWAY_PAUSE": {
      if (pathway.id !== event.pathwayId) return pathway;
      if (pathway.status === "completed" || pathway.status === "cancelled") return pathway;
      let next: Pathway = { ...pathway, status: "paused" };
      const cp = createCheckpoint(
        next,
        "manual_pause",
        next.currentStageId,
        next.currentStepId,
      );
      next = appendCheckpoint(next, cp);
      next = appendAudit(next, createExecutionReceipt({
        pathwayId: pathway.id,
        kind: "pathway_paused",
        summary: "Pathway paused",
      }));
      return touch(next);
    }

    case "PATHWAY_RESUME": {
      if (pathway.id !== event.pathwayId) return pathway;
      if (pathway.status !== "paused") return pathway;
      let next: Pathway = { ...pathway, status: "active" };
      next = appendAudit(next, createExecutionReceipt({
        pathwayId: pathway.id,
        kind: "pathway_resumed",
        summary: "Pathway resumed",
      }));
      return touch(next);
    }

    case "PRIVACY_HANDOFF_ENTER": {
      if (pathway.id !== event.handoff.pathwayId) return pathway;
      const { handoff } = event;
      let next = pathway;
      const cp = createCheckpoint(next, "before_privacy_handoff", handoff.stageId, handoff.stepId);
      next = appendCheckpoint(next, cp);
      next = {
        ...next,
        status: "privacy_handoff",
        pendingHandoff: { ...handoff, state: "active" },
        currentStageId: handoff.stageId,
        currentStepId: handoff.stepId,
      };
      next = updateStage(next, handoff.stageId, { status: "privacy_handoff" });
      next = updateStep(next, handoff.stepId, { status: "privacy_handoff" });
      next = appendAudit(next, createExecutionReceipt({
        pathwayId: pathway.id,
        stageId: handoff.stageId,
        stepId: handoff.stepId,
        kind: "privacy_handoff_entered",
        summary: handoff.reason,
      }));
      return touch(next);
    }

    case "PRIVACY_HANDOFF_RESUME": {
      if (!pathway.pendingHandoff || pathway.pendingHandoff.id !== event.handoffId) {
        return pathway;
      }
      const handoff = pathway.pendingHandoff;
      let next: Pathway = {
        ...pathway,
        status: "active",
        pendingHandoff: { ...handoff, state: "resumed", resumedAt: new Date().toISOString() },
      };
      next = updateStage(next, handoff.stageId, { status: "active" });
      next = updateStep(next, handoff.stepId, { status: "active" });
      next = appendAudit(next, createExecutionReceipt({
        pathwayId: pathway.id,
        stageId: handoff.stageId,
        stepId: handoff.stepId,
        kind: "privacy_handoff_resumed",
        summary: `Resumed via ${event.trigger}`,
        metadata: { trigger: event.trigger },
      }));
      return touch({ ...next, pendingHandoff: null });
    }

    case "OPERATOR_RUN_REQUESTED": {
      if (pathway.id !== event.pathwayId) return pathway;
      const step = findStep(pathway, event.stepId);
      if (!step) return pathway;
      const cp = createCheckpoint(pathway, "before_operator_run", step.stageId, step.id);
      let next = appendCheckpoint(pathway, cp);
      next = {
        ...next,
        status: "operator_running",
        currentStepId: step.id,
        currentStageId: step.stageId,
      };
      next = updateStep(next, step.id, { status: "running_operator" });
      next = appendAudit(next, createExecutionReceipt({
        pathwayId: pathway.id,
        stageId: step.stageId,
        stepId: step.id,
        kind: "operator_started",
        summary: `Operator run for step ${step.index}`,
      }));
      return touch(next);
    }

    case "OPERATOR_RUN_COMPLETED": {
      if (pathway.id !== event.pathwayId) return pathway;
      const step = findStep(pathway, event.stepId);
      if (!step) return pathway;
      let next = updateStep(pathway, step.id, { status: "active" });
      next = { ...next, status: "active" };
      next = appendAudit(next, createExecutionReceipt({
        pathwayId: pathway.id,
        stageId: step.stageId,
        stepId: step.id,
        kind: "operator_completed",
        summary: `Operator run finished for step ${step.index}`,
      }));
      return touch(next);
    }

    case "APPROVAL_REQUESTED": {
      if (pathway.id !== event.gate.pathwayId) return pathway;
      let next: Pathway = {
        ...pathway,
        status: "awaiting_approval",
        pendingGate: event.gate,
      };
      const cp = createCheckpoint(next, "before_gate", event.gate.stageId, event.gate.stepId);
      next = appendCheckpoint(next, cp);
      next = appendAudit(next, createExecutionReceipt({
        pathwayId: pathway.id,
        stageId: event.gate.stageId,
        stepId: event.gate.stepId,
        kind: "gate_requested",
        summary: event.gate.reason,
      }));
      return touch(next);
    }

    case "APPROVAL_RESOLVED": {
      if (!pathway.pendingGate || pathway.pendingGate.id !== event.gateId) return pathway;
      const gate = pathway.pendingGate;
      let next: Pathway = {
        ...pathway,
        pendingGate: {
          ...gate,
          state: event.resolution === "approved" ? "approved" : "rejected",
          resolvedAt: new Date().toISOString(),
        },
        status: event.resolution === "approved" ? "active" : "blocked",
      };
      next = appendAudit(next, createExecutionReceipt({
        pathwayId: pathway.id,
        stageId: gate.stageId,
        stepId: gate.stepId,
        kind: event.resolution === "approved" ? "gate_approved" : "gate_rejected",
        summary: gate.reason,
      }));
      return touch({ ...next, pendingGate: null });
    }

    case "RESOURCE_DISCOVERED": {
      if (pathway.id !== event.pathwayId) return pathway;
      const resources = [...pathway.context.discoveredResources, event.resource];
      let next: Pathway = {
        ...pathway,
        context: { ...pathway.context, discoveredResources: resources },
      };
      next = appendAudit(next, createExecutionReceipt({
        pathwayId: pathway.id,
        stageId: event.stageId,
        kind: "resource_discovered",
        summary: event.resource.title,
        metadata: { url: event.resource.url },
      }));
      return touch(next);
    }

    case "PATHWAY_COMPLETE": {
      if (pathway.id !== event.pathwayId) return pathway;
      const now = new Date().toISOString();
      let next: Pathway = {
        ...pathway,
        status: "completed",
        completedAt: now,
        currentStageId: null,
        currentStepId: null,
      };
      next = appendAudit(next, createExecutionReceipt({
        pathwayId: pathway.id,
        kind: "pathway_completed",
        summary: "Pathway marked complete",
      }));
      return touch(next);
    }

    case "PATHWAY_FAIL": {
      if (pathway.id !== event.pathwayId) return pathway;
      let next: Pathway = { ...pathway, status: "failed" };
      next = appendAudit(next, createExecutionReceipt({
        pathwayId: pathway.id,
        kind: "pathway_failed",
        summary: event.error.message,
        metadata: { code: event.error.code },
      }));
      return touch(next);
    }

    default:
      return pathway;
  }
}

export function dispatchPathwayEvent(pathway: Pathway, event: WorkflowEvent): Pathway {
  return pathwayReducer(pathway, event);
}

export function latestCheckpoint(pathway: Pathway): Checkpoint | null {
  return pathway.checkpoints.at(-1) ?? null;
}

export function restorePathwayFromCheckpoint(pathway: Pathway, checkpointId: string): Pathway | null {
  const cp = pathway.checkpoints.find((c) => c.id === checkpointId);
  if (!cp) return null;
  return touch({
    ...pathway,
    status: cp.statusSnapshot.pathwayStatus,
    context: structuredClone(cp.contextSnapshot),
    currentStageId: cp.stageId,
    currentStepId: cp.stepId,
  });
}

export function pathwayStatusLabel(status: PathwayStatus): string {
  const labels: Record<PathwayStatus, string> = {
    drafting: "Drafting",
    awaiting_confirmation: "Awaiting confirmation",
    ready: "Ready",
    active: "In progress",
    paused: "Paused",
    awaiting_input: "Awaiting input",
    awaiting_approval: "Awaiting approval",
    privacy_handoff: "Privacy handoff",
    operator_running: "Operator running",
    blocked: "Blocked",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  };
  return labels[status] ?? status;
}

export function stepStatusLabel(status: StepStatus): string {
  return status.replace(/_/g, " ");
}
