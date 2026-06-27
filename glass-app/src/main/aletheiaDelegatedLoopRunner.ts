/**
 * Aletheia general delegated loop runner (B3.3).
 */

import { randomUUID } from "node:crypto";
import type { ActionIntent, PipelineStage } from "../shared/aletheiaExecution.ts";
import {
  appendLoopNarrative,
  buildDelegatedLoopHandoff,
  buildDelegatedLoopPlan,
  formatDelegatedLoopHandoffSpeech,
  initialDelegatedLoopSnapshot,
  markLoopPhase,
  narrativeForStepStart,
  updateLoopStep,
  type AletheiaDelegatedLoopSnapshot,
  type DelegatedLoopIntent,
  type DelegatedLoopStepPlan,
} from "../shared/aletheiaDelegatedLoop.ts";
import type { DelegatedPresenceIntent } from "../shared/aletheiaDelegatedPresence.ts";
import { buildDelegatedPresenceFallbackReport } from "../shared/aletheiaDelegatedPresence.ts";
import {
  focusDelegatedApp,
  observeDelegatedAppReport,
  type AletheiaDelegatedPresenceHost,
} from "./aletheiaDelegatedPresenceRunner.ts";
import { appendActionLedgerEntry } from "./aletheiaActionLedgerStore.ts";
import { runAgent } from "./agentRunner.ts";
import { formatComputerUseRouteNarration } from "./aletheiaComputerUseExecutor.ts";
import { isAletheiaCompanionOperationAborted } from "./aletheiaCompanionOperation.ts";

export type LoopDecision = "continue" | "cancel";

export interface AletheiaDelegatedLoopHost extends AletheiaDelegatedPresenceHost {
  getLoopSnapshot: () => AletheiaDelegatedLoopSnapshot | undefined;
  setLoopSnapshot: (snapshot: AletheiaDelegatedLoopSnapshot | undefined) => void;
  getAnthropicModel: () => string;
  getOutputDir: () => string;
  awaitLoopDecision: (question: string) => Promise<LoopDecision>;
  shouldCancelLoop?: () => boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setLoopSnapshot(
  host: AletheiaDelegatedLoopHost,
  snapshot: AletheiaDelegatedLoopSnapshot,
  signal?: AbortSignal,
): void {
  if (isAletheiaCompanionOperationAborted(signal)) return;
  host.setLoopSnapshot(snapshot);
  host.push();
}

function loopLedgerIntent(sessionId: string, goal: string): ActionIntent {
  return {
    id: randomUUID(),
    sessionId,
    kind: "delegated",
    summary: "Delegated loop",
    rationale: goal,
    scope: { description: "Multi-step delegated loop across apps" },
    payload: { goal },
    requestedAt: Date.now(),
  };
}

function recordLedger(
  intent: ActionIntent,
  stage: PipelineStage,
  narration: string,
  ok: boolean | null,
): void {
  appendActionLedgerEntry({ intent, stage, narration, ok });
}

async function runResearchStep(
  host: AletheiaDelegatedLoopHost,
  prompt: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; result?: string; errorMessage?: string }> {
  const result = await runAgent({
    runId: `loop-research-${randomUUID()}`,
    agentId: "research",
    prompt,
    outputDir: host.getOutputDir(),
    anthropicModel: host.getAnthropicModel(),
    sessionId: host.getSessionId(),
    signal,
    onEvent: () => {},
  });
  if (isAletheiaCompanionOperationAborted(signal)) {
    return { ok: false, errorMessage: "Loop cancelled." };
  }
  if (result.outcome === "done") {
    return {
      ok: true,
      result: result.outputExcerpt ?? result.summary ?? "Research complete.",
    };
  }
  return { ok: false, errorMessage: result.error ?? "Research did not complete." };
}

async function runWritingStep(
  host: AletheiaDelegatedLoopHost,
  prompt: string,
  context: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; result?: string; errorMessage?: string }> {
  const fullPrompt = context.trim()
    ? `${prompt}\n\nContext from prior steps:\n${context.slice(0, 4000)}`
    : prompt;
  const result = await runAgent({
    runId: `loop-writing-${randomUUID()}`,
    agentId: "writing",
    prompt: fullPrompt,
    outputDir: host.getOutputDir(),
    anthropicModel: host.getAnthropicModel(),
    sessionId: host.getSessionId(),
    signal,
    onEvent: () => {},
  });
  if (isAletheiaCompanionOperationAborted(signal)) {
    return { ok: false, errorMessage: "Loop cancelled." };
  }
  if (result.outcome === "done") {
    return {
      ok: true,
      result: result.outputExcerpt ?? result.summary ?? "Draft complete.",
    };
  }
  return { ok: false, errorMessage: result.error ?? "Writing did not complete." };
}

async function executeLoopStep(
  host: AletheiaDelegatedLoopHost,
  step: DelegatedLoopStepPlan,
  priorContext: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; result?: string; errorMessage?: string; needsDecision?: boolean }> {
  if (isAletheiaCompanionOperationAborted(signal)) {
    return { ok: false, errorMessage: "Loop cancelled." };
  }
  switch (step.kind) {
    case "research":
      return runResearchStep(host, step.prompt, signal);
    case "writing":
      return runWritingStep(host, step.prompt, priorContext, signal);
    case "focus_observe": {
      if (!step.targetApp) {
        return { ok: false, errorMessage: "No target app for this step." };
      }
      const focus = await focusDelegatedApp(step.targetApp);
      if (!focus.ok) {
        return {
          ok: false,
          errorMessage: focus.message,
          needsDecision: true,
        };
      }
      await delay(900);
      const intent: DelegatedPresenceIntent = {
        targetApp: step.targetApp,
        goal: step.prompt,
        reportQuestion: step.reportQuestion ?? step.prompt,
        matched: step.label,
      };
      const report = await observeDelegatedAppReport(host, intent, signal);
      if (isAletheiaCompanionOperationAborted(signal)) {
        return { ok: false, errorMessage: "Loop cancelled." };
      }
      return {
        ok: true,
        result: `${formatComputerUseRouteNarration({ ok: true, message: focus.message, tier: "applescript", method: focus.method })} ${report}`,
      };
    }
    case "observe_context": {
      const ctx = host.getWindowContext();
      const digest = host.getScreenDigest();
      const report = buildDelegatedPresenceFallbackReport({
        targetApp: ctx.appName ?? "current app",
        reportQuestion: step.reportQuestion ?? step.prompt,
        windowTitle: ctx.windowTitle,
        frontApp: ctx.appName,
        screenDigest: digest,
      });
      return { ok: true, result: report };
    }
    case "handoff":
      return { ok: true, result: "Handoff ready." };
    default:
      return { ok: false, errorMessage: "Unknown step kind." };
  }
}

export async function runAletheiaDelegatedLoop(
  host: AletheiaDelegatedLoopHost,
  intent: DelegatedLoopIntent,
  options?: { signal?: AbortSignal },
): Promise<{ ok: boolean; handoff?: string; errorMessage?: string }> {
  const signal = options?.signal;
  const sessionId = host.getSessionId();
  const ledgerIntent = loopLedgerIntent(sessionId, intent.goal);
  const plan = buildDelegatedLoopPlan(intent.goal);

  let snapshot = initialDelegatedLoopSnapshot(intent.goal, plan);
  snapshot = appendLoopNarrative(
    snapshot,
    "I'm mapping out the steps I'll take.",
    -1,
  );
  setLoopSnapshot(host, markLoopPhase(snapshot, "running"), signal);
  recordLedger(ledgerIntent, "planning", `Loop plan: ${plan.length} steps`, true);

  const stepResults: string[] = [];
  let cancelled = false;

  for (let index = 0; index < snapshot.steps.length; index += 1) {
    if (host.shouldCancelLoop?.() || isAletheiaCompanionOperationAborted(signal)) {
      cancelled = true;
      break;
    }

    const step = snapshot.steps[index];
    if (step.kind === "handoff") continue;

    snapshot = markLoopPhase(snapshot, "running", { currentStepIndex: index });
    snapshot = updateLoopStep(snapshot, step.id, { status: "running" });
    snapshot = appendLoopNarrative(snapshot, narrativeForStepStart(step), index);
    setLoopSnapshot(host, snapshot, signal);

    const priorContext = stepResults.join("\n\n");
    const outcome = await executeLoopStep(host, step, priorContext, signal);

    if (isAletheiaCompanionOperationAborted(signal)) {
      cancelled = true;
      break;
    }

    if (!outcome.ok && outcome.needsDecision) {
      const question = `I hit a snag on "${step.label}": ${outcome.errorMessage ?? "unknown error"}. Should I keep going?`;
      snapshot = updateLoopStep(snapshot, step.id, { status: "failed" });
      snapshot = markLoopPhase(snapshot, "awaiting_decision", {
        pendingDecision: { question, stepId: step.id },
      });
      snapshot = appendLoopNarrative(snapshot, question, index);
      setLoopSnapshot(host, snapshot, signal);

      const decision = await host.awaitLoopDecision(question);
      if (decision === "cancel" || isAletheiaCompanionOperationAborted(signal)) {
        cancelled = true;
        snapshot = markLoopPhase(snapshot, "cancelled", { pendingDecision: undefined });
        break;
      }
      snapshot = updateLoopStep(snapshot, step.id, { status: "skipped" });
      snapshot = appendLoopNarrative(snapshot, "Continuing with the next step.", index);
      setLoopSnapshot(host, markLoopPhase(snapshot, "running", { pendingDecision: undefined }), signal);
      continue;
    }

    if (!outcome.ok) {
      snapshot = updateLoopStep(snapshot, step.id, {
        status: "failed",
        result: outcome.errorMessage,
      });
      snapshot = appendLoopNarrative(
        snapshot,
        `That step didn't work: ${outcome.errorMessage ?? "unknown error"}.`,
        index,
      );
      setLoopSnapshot(host, snapshot, signal);
      continue;
    }

    if (outcome.result) stepResults.push(outcome.result);
    snapshot = updateLoopStep(snapshot, step.id, {
      status: "done",
      result: outcome.result,
    });
    snapshot = appendLoopNarrative(
      snapshot,
      step.kind === "research"
        ? "I found useful material to work with."
        : step.kind === "writing"
          ? "Draft is ready."
          : "That step is done.",
      index,
    );
    setLoopSnapshot(host, snapshot, signal);
  }

  if (isAletheiaCompanionOperationAborted(signal)) {
    return { ok: false, errorMessage: "Loop cancelled." };
  }

  const handoffData = buildDelegatedLoopHandoff(snapshot);
  const handoffSpeech = cancelled
    ? `I stopped when you asked. ${handoffData.completed}`
    : formatDelegatedLoopHandoffSpeech(handoffData);

  snapshot = markLoopPhase(snapshot, cancelled ? "cancelled" : "complete", {
    handoff: handoffData,
    pendingDecision: undefined,
    currentStepIndex: snapshot.steps.length - 1,
  });
  snapshot = updateLoopStep(
    snapshot,
    snapshot.steps[snapshot.steps.length - 1]?.id ?? "step-1",
    { status: "done", result: handoffSpeech },
  );
  snapshot = appendLoopNarrative(snapshot, handoffSpeech, snapshot.steps.length - 1);
  setLoopSnapshot(host, snapshot, signal);
  recordLedger(ledgerIntent, cancelled ? "failed" : "complete", handoffSpeech.slice(0, 500), !cancelled);

  return {
    ok: !cancelled,
    handoff: handoffSpeech,
    errorMessage: cancelled ? "Loop cancelled." : undefined,
  };
}

export function clearAletheiaDelegatedLoopState(host: AletheiaDelegatedLoopHost): void {
  host.setLoopSnapshot(undefined);
}
