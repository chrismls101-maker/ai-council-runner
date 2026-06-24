/**
 * Glass QA recovery loop — selective re-run, convergence, recovery plan (pure).
 */

import type { QaCheck, QaCheckId, QaShipState } from "./glassQaPipeline.ts";
import { deriveQaShipState } from "./glassQaPipeline.ts";
import { formatStructuredFailure } from "./glassQaStructuredParsers.ts";
import { CODER_LOOP_MAX_ITERATIONS } from "./coderBuildLoopShared.ts";

export type QaRecoveryLoopStatus = "failed" | "running" | "passed";

export interface QaRecoveryLoopEntry {
  iteration: number;
  failedCheckIds: QaCheckId[];
  failedLabels: string[];
  status: QaRecoveryLoopStatus;
}

export interface QaRecoveryState {
  /** Stable id across fix-loop coder runs. */
  sessionId: string;
  iteration: number;
  maxIterations: number;
  pendingRerun: QaCheckId[];
  preservedChecks: QaCheck[];
  loopHistory: QaRecoveryLoopEntry[];
  recoveryPlan: string[];
  fixPromptPreview?: string;
  /** Latest failure signatures from the last completed QA pass. */
  failureSignatures: string[];
  /** Prior iteration signatures for convergence detection. */
  signatureHistory: string[][];
  needsHumanJudgment?: boolean;
  judgmentReason?: string | null;
  lastFailedCheckId?: QaCheckId | null;
}

const RERUN_ORDER: QaCheckId[] = [
  "types",
  "tests",
  "lint",
  "preview",
  "review-1",
  "review-2",
];

/** Checks to execute after a fix, including dependents. */
export function computeRerunChecks(
  failedIds: QaCheckId[],
  options?: { previewWasSkipped?: boolean; previewWasRun?: boolean },
): QaCheckId[] {
  const set = new Set<QaCheckId>();
  const previewWasRun = options?.previewWasRun ?? !options?.previewWasSkipped;

  for (const id of failedIds) {
    switch (id) {
      case "types":
        set.add("types");
        set.add("tests");
        if (previewWasRun) set.add("preview");
        break;
      case "tests":
        set.add("types");
        set.add("tests");
        if (previewWasRun) set.add("preview");
        break;
      case "lint":
        set.add("lint");
        break;
      case "preview":
        set.add("types");
        set.add("tests");
        set.add("preview");
        break;
      case "review-1":
        set.add("review-1");
        break;
      case "review-2":
        set.add("review-2");
        break;
      default:
        set.add(id);
    }
  }

  return RERUN_ORDER.filter((id) => set.has(id));
}

export function qaCheckFailureSignature(check: QaCheck): string | null {
  if (check.status !== "fail") return null;
  const failure = check.failures?.[0];
  if (failure) {
    return `${check.id}|${failure.file ?? ""}|${failure.line ?? ""}|${failure.message}`;
  }
  return `${check.id}|${check.detail ?? ""}|${(check.fixPrompt ?? "").slice(0, 160)}`;
}

export function collectFailureSignatures(checks: QaCheck[]): string[] {
  return checks
    .map(qaCheckFailureSignature)
    .filter((s): s is string => Boolean(s))
    .sort();
}

export function detectRepeatedFailures(
  current: string[],
  history: string[][],
): { repeated: boolean; reason: string | null } {
  if (!current.length || !history.length) {
    return { repeated: false, reason: null };
  }
  const key = current.join(";;");
  const matches = history.filter((h) => h.join(";;") === key).length;
  if (matches >= 1) {
    return {
      repeated: true,
      reason: "Same failing checks appeared again — automated repair may not be converging.",
    };
  }
  return { repeated: false, reason: null };
}

export function extractRecoveryPlan(checks: QaCheck[], maxItems = 5): string[] {
  const plan: string[] = [];
  for (const check of checks) {
    if (check.status !== "fail") continue;
    for (const failure of check.failures ?? []) {
      plan.push(formatStructuredFailure(failure));
      if (plan.length >= maxItems) return plan;
    }
    if (plan.length < maxItems && check.detail) {
      plan.push(`${check.label}: ${check.detail}`);
    }
    if (plan.length >= maxItems) break;
  }
  return plan.slice(0, maxItems);
}

export function mergeChecksForRerun(
  template: QaCheck[],
  preserved: QaCheck[],
  rerunIds: Set<QaCheckId>,
): QaCheck[] {
  const preservedMap = new Map(preserved.map((c) => [c.id, c]));
  return template.map((slot) => {
    if (rerunIds.has(slot.id)) {
      return { ...slot, status: "pending" as const, detail: undefined, failures: undefined };
    }
    const kept = preservedMap.get(slot.id);
    if (kept && kept.status !== "fail") {
      return { ...kept };
    }
    return { ...slot };
  });
}

export function shouldRunQaCheck(
  checkId: QaCheckId,
  rerunOnly: QaCheckId[] | null | undefined,
): boolean {
  if (!rerunOnly?.length) return true;
  return rerunOnly.includes(checkId);
}

export function updateLoopHistoryEntry(
  history: QaRecoveryLoopEntry[],
  iteration: number,
  patch: Partial<QaRecoveryLoopEntry>,
): QaRecoveryLoopEntry[] {
  const idx = history.findIndex((e) => e.iteration === iteration);
  if (idx < 0) return history;
  const next = [...history];
  next[idx] = { ...next[idx], ...patch };
  return next;
}

export function appendRunningLoopEntry(
  history: QaRecoveryLoopEntry[],
  iteration: number,
  failedCheckIds: QaCheckId[],
  failedLabels: string[],
): QaRecoveryLoopEntry[] {
  return [
    ...history.filter((e) => e.iteration !== iteration),
    {
      iteration,
      failedCheckIds,
      failedLabels,
      status: "running",
    },
  ];
}

export function deriveRecoveryShipState(
  checks: QaCheck[],
  recovery: QaRecoveryState | null | undefined,
): QaShipState | null {
  if (recovery?.needsHumanJudgment) return "needs-human-judgment";
  return deriveQaShipState(checks);
}

export function emptyQaRecoveryState(sessionId: string): QaRecoveryState {
  return {
    sessionId,
    iteration: 1,
    maxIterations: CODER_LOOP_MAX_ITERATIONS,
    pendingRerun: [],
    preservedChecks: [],
    loopHistory: [],
    recoveryPlan: [],
    failureSignatures: [],
    signatureHistory: [],
    needsHumanJudgment: false,
    judgmentReason: null,
    lastFailedCheckId: null,
  };
}

export interface QaRecoveryUiModel {
  visible: boolean;
  sessionId: string | null;
  iteration: number;
  maxIterations: number;
  recoveryPlan: string[];
  loopHistory: QaRecoveryLoopEntry[];
  fixPromptPreview: string | null;
  needsHumanJudgment: boolean;
  judgmentReason: string | null;
  lastFailedLabel: string | null;
  pendingRerunLabel: string | null;
  canRollback: boolean;
}

export function deriveQaRecoveryUi(input: {
  recovery: QaRecoveryState | null | undefined;
  loopIteration?: number;
  hasCheckpoint?: boolean;
}): QaRecoveryUiModel {
  const { recovery, loopIteration, hasCheckpoint } = input;
  const iteration = recovery?.iteration ?? loopIteration ?? 1;
  const inLoop = iteration > 1 || Boolean(recovery?.loopHistory.length);
  const visible = Boolean(
    recovery
    && (inLoop || recovery.needsHumanJudgment || recovery.recoveryPlan.length > 0),
  );

  const lastEntry = recovery?.loopHistory[recovery.loopHistory.length - 1];
  const lastFailedLabel = lastEntry?.failedLabels[0]
    ?? recovery?.preservedChecks.find((c) => c.status === "fail")?.label
    ?? null;

  const pendingRerunLabel = recovery?.pendingRerun.length
    ? `Re-run: ${recovery.pendingRerun.join(", ")}`
    : null;

  return {
    visible,
    sessionId: recovery?.sessionId ?? null,
    iteration,
    maxIterations: recovery?.maxIterations ?? CODER_LOOP_MAX_ITERATIONS,
    recoveryPlan: recovery?.recoveryPlan ?? [],
    loopHistory: recovery?.loopHistory ?? [],
    fixPromptPreview: recovery?.fixPromptPreview ?? null,
    needsHumanJudgment: recovery?.needsHumanJudgment === true,
    judgmentReason: recovery?.judgmentReason ?? null,
    lastFailedLabel,
    pendingRerunLabel,
    canRollback: Boolean(hasCheckpoint && recovery?.sessionId),
  };
}
