/**
 * AletheiaComputerOperatorLoop — one-step operator policy, snapshot, and narration.
 *
 * Shared logic for the operator runner: snapshot state machine, heuristic fallback policy,
 * audit trail helpers, and narration. The LLM vision step picker lives in
 * aletheiaComputerOperatorPolicy.ts; this file is the loop shell it runs inside.
 *
 * See aletheiaComputerOperatorRunner.ts for the full capture → plan → execute → verify cycle.
 * See aletheiaActionOrchestrator.ts for single-shot deterministic actions (no screen needed).
 */

import { randomUUID } from "node:crypto";
import type { ComputerOperatorPlan } from "./aletheiaConversationPlanner.ts";
import type { GroundedUiState } from "./aletheiaGroundedUiState.ts";
import {
  extractGoalKeywords as extractKeywords,
  findCandidateById as findCandidate,
  scoreCandidateForGoal as scoreCandidate,
} from "./aletheiaGroundedUiState.ts";
import type { ActionVerificationResult } from "./aletheiaActionVerifier.ts";
import { evaluateOperatorSuccess } from "./aletheiaActionVerifier.ts";
import type { ComputerOperatorSessionGrant } from "./aletheiaComputerSessionAuthority.ts";

import type { OperatorAction, OperatorActionKind } from "./aletheiaComputerOperatorTypes.ts";
import type { AletheiaGhostCursorState } from "./aletheiaGhostCursor.ts";

export type { OperatorAction, OperatorActionKind };

export interface OperatorStepDecision {
  currentBelief: string;
  intendedNextEffect: string;
  action: OperatorAction;
  confidence: number;
  pauseReason?: string;
}

export type ComputerOperatorPhase =
  | "awaiting_confirm"
  | "awaiting_grant"
  | "running"
  | "paused"
  | "complete"
  | "failed";

/** Which UI surface initiated the operator session (one live UI per session). */
export type ComputerOperatorEntrySurface = "conversation" | "dashboard";

export const COMPUTER_OPERATOR_PLACEHOLDER_GOAL = "Enter a task in the grant card below.";

export interface ComputerOperatorAuditRow {
  id: string;
  step: number;
  belief?: string;
  intendedEffect?: string;
  action: OperatorAction;
  narration: string;
  ok: boolean | null;
  verificationSummary?: string;
  createdAt: number;
}

export interface AletheiaComputerOperatorSnapshot {
  loopId: string;
  phase: ComputerOperatorPhase;
  /** Originating UI — only this surface shows live grant/audit during an active session. */
  entrySurface?: ComputerOperatorEntrySurface;
  plan: ComputerOperatorPlan;
  sessionGrant?: ComputerOperatorSessionGrant;
  step: number;
  audit: ComputerOperatorAuditRow[];
  currentBelief?: string;
  narrative?: string;
  summary?: string;
  pauseReason?: string;
  readSummary?: string;
  updatedAt: number;
  /** Pre-click pointer on the overlay — cleared during capture / thinking steps. */
  ghostCursor?: AletheiaGhostCursorState;
}

function appMatchesFront(plan: ComputerOperatorPlan, state: GroundedUiState): boolean {
  if (!plan.targetApps.length) return true;
  const front = state.activeApp?.toLowerCase() ?? "";
  return plan.targetApps.some(
    (app) => front.includes(app.toLowerCase()) || app.toLowerCase().includes(front),
  );
}

/** Strict one-action operator policy (heuristic v1 — model contract shape). */
export function selectOperatorStepDecision(input: {
  plan: ComputerOperatorPlan;
  state: GroundedUiState;
  step: number;
  clickedTargetIds: string[];
  lastVerification?: ActionVerificationResult;
  readSummary?: string;
}): OperatorStepDecision {
  const { plan, state, step, clickedTargetIds, readSummary } = input;

  if (step >= plan.stepBudget) {
    return {
      currentBelief: "Step budget exhausted.",
      intendedNextEffect: "Stop and report progress.",
      action: { kind: "pause", reason: `Reached max ${plan.stepBudget} steps.` },
      confidence: 0.95,
      pauseReason: `Step limit (${plan.stepBudget}) reached.`,
    };
  }

  const success = evaluateOperatorSuccess(plan.successCriteria, state, readSummary, plan.goal);
  if (success.complete && step > 0) {
    return {
      currentBelief: `Success criteria met: ${success.matched.join("; ")}`,
      intendedNextEffect: "Mark task complete.",
      action: { kind: "done", reason: success.matched.join("; ") },
      confidence: 0.88,
    };
  }

  if (plan.targetApps.length && !appMatchesFront(plan, state)) {
    const app = plan.targetApps[0];
    return {
      currentBelief: `Front app is ${state.activeApp ?? "unknown"}; target is ${app}.`,
      intendedNextEffect: `Focus ${app}.`,
      action: { kind: "focus_app", app },
      confidence: 0.9,
    };
  }

  const keywords = extractKeywords(plan.goal);
  const candidates = state.candidates
    .filter((c) => !clickedTargetIds.includes(c.id))
    .filter((c) => c.actionability >= 0.5)
    .map((c) => ({ c, score: scoreCandidate(c, keywords) }))
    .sort((a, b) => b.score - a.score);

  if (candidates.length > 0 && candidates[0].score >= 0.55) {
    const pick = candidates[0].c;
    return {
      currentBelief: `Found actionable target "${pick.label}" (${pick.source}, confidence ${pick.confidence.toFixed(2)}).`,
      intendedNextEffect: `Click "${pick.label}".`,
      action: { kind: "click_target", targetId: pick.id },
      confidence: Math.min(0.92, pick.score),
    };
  }

  if (readSummary?.trim()) {
    return {
      currentBelief: "Screen content captured.",
      intendedNextEffect: "Complete task with summary.",
      action: { kind: "done", reason: readSummary.slice(0, 200) },
      confidence: 0.82,
    };
  }

  if (step >= 2) {
    return {
      currentBelief: "Navigation stalled — capture screen content for summary.",
      intendedNextEffect: "Read visible region and summarize.",
      action: { kind: "read_region" },
      confidence: 0.75,
    };
  }

  return {
    currentBelief: "No confident target — UI may need another capture pass.",
    intendedNextEffect: "Pause for user guidance.",
    action: { kind: "pause", reason: "Ambiguous UI — no grounded target above confidence threshold." },
    confidence: 0.4,
    pauseReason: "Ambiguous UI — could not pick a grounded action.",
  };
}

export function initialComputerOperatorSnapshot(
  plan: ComputerOperatorPlan,
  options?: { awaitingConfirm?: boolean; entrySurface?: ComputerOperatorEntrySurface },
): AletheiaComputerOperatorSnapshot {
  const phase: ComputerOperatorPhase = options?.awaitingConfirm
    ? "awaiting_confirm"
    : plan.requiresConfirmation
      ? "awaiting_grant"
      : "awaiting_grant";
  return {
    loopId: randomUUID(),
    phase,
    entrySurface: options?.entrySurface,
    plan,
    step: 0,
    audit: [],
    narrative: `Planned: ${plan.goal}`,
    updatedAt: Date.now(),
  };
}

export function appendComputerOperatorAudit(
  snapshot: AletheiaComputerOperatorSnapshot,
  row: Omit<ComputerOperatorAuditRow, "id" | "createdAt">,
): AletheiaComputerOperatorSnapshot {
  return {
    ...snapshot,
    audit: [
      ...snapshot.audit,
      {
        ...row,
        id: randomUUID(),
        createdAt: Date.now(),
      },
    ],
    updatedAt: Date.now(),
  };
}

export function finalizeComputerOperatorSnapshot(
  snapshot: AletheiaComputerOperatorSnapshot,
  input: { ok: boolean; summary: string; phase?: ComputerOperatorPhase },
): AletheiaComputerOperatorSnapshot {
  return {
    ...snapshot,
    phase: input.phase ?? (input.ok ? "complete" : "failed"),
    summary: input.summary,
    updatedAt: Date.now(),
  };
}

export function narrateOperatorStep(
  decision: OperatorStepDecision,
  verification?: ActionVerificationResult,
): string {
  const actionDesc =
    decision.action.kind === "click_target"
      ? `click ${decision.action.targetId ?? "target"}`
      : decision.action.kind === "focus_app"
        ? `focus ${decision.action.app ?? "app"}`
        : decision.action.kind;
  const verify = verification?.summary ? ` — ${verification.summary}` : "";
  return `${decision.intendedNextEffect} (${actionDesc})${verify}`;
}

export function resolveOperatorTargetLabel(
  state: GroundedUiState,
  action: OperatorAction,
): string | undefined {
  if (action.kind !== "click_target") return undefined;
  const candidate = findCandidate(state, action.targetId);
  return candidate?.label;
}
