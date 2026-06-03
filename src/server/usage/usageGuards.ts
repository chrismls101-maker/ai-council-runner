import { appendAuditEvent } from "../audit/auditLog.js";
import { calculateRefundCredits, estimateCredits } from "./creditRules.js";
import {
  appendUsageEvent,
  deductCredits,
  getUsageState,
  refundCredits,
} from "./usageStore.js";
import type { CreditEstimate, RunUsageSummary } from "./types.js";
import { InsufficientCreditsError } from "./types.js";

export { InsufficientCreditsError };

const runCreditLedger = new Map<
  string,
  {
    creditsCharged: number;
    breakdown: CreditEstimate["breakdown"];
    providerCallsStarted: boolean;
    directAnswerFailedBeforeModel: boolean;
  }
>();

export async function logCreditEstimate(
  estimate: CreditEstimate,
  metadata?: string,
): Promise<void> {
  const state = await getUsageState();
  await appendUsageEvent({
    eventType: "credits_estimated",
    workflowId: estimate.workflowId,
    tokenMode: estimate.tokenMode,
    credits: estimate.estimatedCredits,
    balanceAfter: state.currentCredits,
    metadata,
  });
}

export async function guardAndDeductCredits(input: {
  runId: string;
  workflowId?: string;
  routeId: string;
  tokenMode?: unknown;
  benchmarkEnabled?: boolean;
  prompt?: string;
  entitySearch?: boolean;
  visionScreenshotAnalysis?: boolean;
}): Promise<RunUsageSummary> {
  const estimate = estimateCredits({
    workflowId: input.routeId,
    route: input.routeId,
    tokenMode: input.tokenMode,
    benchmarkEnabled: input.benchmarkEnabled,
    prompt: input.prompt,
    visionScreenshotAnalysis: input.visionScreenshotAnalysis,
  });

  const state = await getUsageState();
  if (state.currentCredits < estimate.estimatedCredits) {
    await appendUsageEvent({
      eventType: "run_blocked_insufficient_credits",
      runId: input.runId,
      workflowId: estimate.workflowId,
      tokenMode: estimate.tokenMode,
      credits: estimate.estimatedCredits,
      balanceAfter: state.currentCredits,
      metadata: `Required ${estimate.estimatedCredits}, have ${state.currentCredits}`,
    });
    await appendAuditEvent({
      eventType: "run_blocked_insufficient_credits",
      runId: input.runId,
      metadata: `need ${estimate.estimatedCredits}, have ${state.currentCredits}`,
    });
    throw new InsufficientCreditsError(estimate.estimatedCredits, state.currentCredits);
  }

  await appendUsageEvent({
    eventType: "credits_reserved",
    runId: input.runId,
    workflowId: estimate.workflowId,
    tokenMode: estimate.tokenMode,
    credits: estimate.estimatedCredits,
    balanceAfter: state.currentCredits,
  });

  const next = await deductCredits({
    credits: estimate.estimatedCredits,
    runId: input.runId,
    workflowId: estimate.workflowId,
    tokenMode: estimate.tokenMode,
    metadata: "Run started",
  });

  runCreditLedger.set(input.runId, {
    creditsCharged: estimate.estimatedCredits,
    breakdown: estimate.breakdown,
    providerCallsStarted: false,
    directAnswerFailedBeforeModel: false,
  });

  return {
    creditsCharged: estimate.estimatedCredits,
    creditsRemaining: next.currentCredits,
    planId: next.planId,
    creditBreakdown: estimate.breakdown,
  };
}

export function markProviderCallsStarted(runId: string): void {
  const entry = runCreditLedger.get(runId);
  if (entry) entry.providerCallsStarted = true;
}

export function markDirectAnswerFailedBeforeModel(runId: string): void {
  const entry = runCreditLedger.get(runId);
  if (entry) entry.directAnswerFailedBeforeModel = true;
}

export async function finalizeRunCredits(input: {
  runId: string;
  status: "complete" | "partial" | "error";
  routeId?: string;
  tokenMode?: string;
  estimatedProviderCostUsd?: number | null;
}): Promise<RunUsageSummary | null> {
  const ledger = runCreditLedger.get(input.runId);
  if (!ledger) return null;

  const refundAmount = calculateRefundCredits({
    creditsCharged: ledger.creditsCharged,
    status: input.status,
    providerCallsStarted: ledger.providerCallsStarted,
    directAnswerFailedBeforeModel: ledger.directAnswerFailedBeforeModel,
  });

  let state = await getUsageState();
  if (refundAmount > 0) {
    state = await refundCredits({
      credits: refundAmount,
      runId: input.runId,
      workflowId: input.routeId,
      tokenMode: input.tokenMode,
      metadata:
        input.status === "error" && ledger.directAnswerFailedBeforeModel
          ? "Direct answer failed before model call"
          : `Refund ${Math.round(refundAmount)} credits (${input.status})`,
    });
  }

  runCreditLedger.delete(input.runId);

  return {
    creditsCharged: ledger.creditsCharged - refundAmount,
    creditsRefunded: refundAmount > 0 ? refundAmount : undefined,
    creditsRemaining: state.currentCredits,
    planId: state.planId,
    creditBreakdown: ledger.breakdown,
    estimatedProviderCostUsd: input.estimatedProviderCostUsd ?? null,
  };
}

export async function checkCreditsAvailable(requiredCredits: number): Promise<{
  ok: boolean;
  currentCredits: number;
}> {
  const state = await getUsageState();
  return {
    ok: state.currentCredits >= requiredCredits,
    currentCredits: state.currentCredits,
  };
}
