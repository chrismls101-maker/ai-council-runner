/**
 * Aletheia delegated presence runner (B3.2).
 */

import { randomUUID } from "node:crypto";
import type { GlassConfig } from "../shared/config.ts";
import type { ActionIntent, PipelineStage } from "../shared/aletheiaExecution.ts";
import {
  appendDelegatedPresenceAudit,
  buildDelegatedPresenceFallbackReport,
  initialDelegatedPresenceSnapshot,
  markDelegatedPresencePhase,
  type AletheiaDelegatedPresenceSnapshot,
  type DelegatedPresenceIntent,
} from "../shared/aletheiaDelegatedPresence.ts";
import { executeComputerUse, formatComputerUseRouteNarration } from "./aletheiaComputerUseExecutor.ts";
import { appendActionLedgerEntry } from "./aletheiaActionLedgerStore.ts";
import { captureDisplayById } from "./capture.ts";
import { askIivoGlass } from "./glassAskClient.ts";
import { GlassAskNoAnthropicKeyError } from "./glassAskAnthropic.ts";
import { optimizeVisualAskImage } from "./visualImageOptimizer.ts";
import { resolveAnthropicApiKey } from "./anthropicKeyStore.ts";

export interface AletheiaDelegatedPresenceHost {
  getSnapshot: () => AletheiaDelegatedPresenceSnapshot | undefined;
  setSnapshot: (snapshot: AletheiaDelegatedPresenceSnapshot | undefined) => void;
  push: () => void;
  getSessionId: () => string;
  getConfig: () => GlassConfig;
  resolveCaptureTarget: () => { id: number; label: string };
  getWindowContext: () => { appName?: string; windowTitle?: string };
  getScreenDigest: () => string | undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setSnapshot(host: AletheiaDelegatedPresenceHost, snapshot: AletheiaDelegatedPresenceSnapshot): void {
  host.setSnapshot(snapshot);
  host.push();
}

function delegatedIntent(sessionId: string, intent: DelegatedPresenceIntent): ActionIntent {
  return {
    id: randomUUID(),
    sessionId,
    kind: "delegated",
    summary: `Delegated presence — ${intent.targetApp}`,
    rationale: intent.goal,
    scope: {
      description: `Operate in ${intent.targetApp} and report back`,
      targetApp: intent.targetApp,
    },
    payload: {
      targetApp: intent.targetApp,
      reportQuestion: intent.reportQuestion,
    },
    requestedAt: Date.now(),
  };
}

function recordLedger(
  intent: ActionIntent,
  stage: PipelineStage,
  narration: string,
  ok: boolean | null,
  errorMessage?: string | null,
): void {
  appendActionLedgerEntry({
    intent,
    stage,
    narration,
    ok,
    errorMessage: errorMessage ?? null,
  });
}

async function observeTargetApp(
  host: AletheiaDelegatedPresenceHost,
  intent: DelegatedPresenceIntent,
): Promise<string> {
  const ctx = host.getWindowContext();
  const digest = host.getScreenDigest();

  if (!resolveAnthropicApiKey()) {
    return buildDelegatedPresenceFallbackReport({
      targetApp: intent.targetApp,
      reportQuestion: intent.reportQuestion,
      windowTitle: ctx.windowTitle,
      frontApp: ctx.appName,
      screenDigest: digest,
    });
  }

  try {
    const target = host.resolveCaptureTarget();
    const shot = await captureDisplayById(target.id, target.label);
    const prompt = [
      `The user asked: "${intent.reportQuestion}"`,
      `Target app: ${intent.targetApp}.`,
      "Answer based on what you see on screen now. Be concise, specific, and speak as Aletheia reporting back.",
      "Do not mention agents, tools, or providers.",
    ].join("\n");

    const optimized = optimizeVisualAskImage(
      shot.imageDataUrl,
      { width: shot.width, height: shot.height },
      { prompt, preset: "default" },
    );

    const response = await askIivoGlass(host.getConfig(), {
      prompt,
      visualIntent: true,
      responseStyle: "full",
      modelPurpose: "semantic",
      latestScreenshot: {
        imageDataUrl: optimized.imageDataUrl,
        label: target.label,
        capturedAt: new Date().toISOString(),
        optimizedWidth: optimized.optimizedWidth,
        optimizedHeight: optimized.optimizedHeight,
      },
    });

    const answer = response.answer?.trim();
    if (answer) return answer;
  } catch (err) {
    if (!(err instanceof GlassAskNoAnthropicKeyError)) {
      console.warn("[aletheiaDelegatedPresence] visual report failed:", err);
    }
  }

  return buildDelegatedPresenceFallbackReport({
    targetApp: intent.targetApp,
    reportQuestion: intent.reportQuestion,
    windowTitle: ctx.windowTitle,
    frontApp: ctx.appName,
    screenDigest: digest,
  });
}

export async function runAletheiaDelegatedPresence(
  host: AletheiaDelegatedPresenceHost,
  intent: DelegatedPresenceIntent,
): Promise<{ ok: boolean; report?: string; errorMessage?: string }> {
  const sessionId = host.getSessionId();
  const ledgerIntent = delegatedIntent(sessionId, intent);

  let snapshot = initialDelegatedPresenceSnapshot(intent);
  setSnapshot(host, snapshot);
  recordLedger(ledgerIntent, "intent", `Delegated task: ${intent.goal}`, true);

  snapshot = markDelegatedPresencePhase(snapshot, "focusing");
  setSnapshot(host, snapshot);

  const focus = await executeComputerUse({
    operation: "activate_app",
    targetApp: intent.targetApp,
  });

  snapshot = appendDelegatedPresenceAudit(snapshot, {
    narration: formatComputerUseRouteNarration(focus),
    method: focus.method,
    ok: focus.ok,
  });
  snapshot = markDelegatedPresencePhase(snapshot, focus.ok ? "observing" : "failed", {
    method: focus.method,
    errorMessage: focus.ok ? undefined : focus.message,
  });
  setSnapshot(host, snapshot);
  recordLedger(
    ledgerIntent,
    focus.ok ? "executing" : "failed",
    formatComputerUseRouteNarration(focus),
    focus.ok,
    focus.ok ? null : focus.message,
  );

  if (!focus.ok) {
    host.setSnapshot(snapshot);
    host.push();
    return { ok: false, errorMessage: focus.message };
  }

  await delay(900);

  snapshot = markDelegatedPresencePhase(snapshot, "reporting");
  setSnapshot(host, snapshot);

  const report = await observeTargetApp(host, intent);

  snapshot = appendDelegatedPresenceAudit(snapshot, {
    narration: "Report synthesized from focused app context.",
    ok: true,
  });
  snapshot = markDelegatedPresencePhase(snapshot, "complete", { report, method: focus.method });
  setSnapshot(host, snapshot);
  recordLedger(ledgerIntent, "complete", report.slice(0, 500), true);

  return { ok: true, report };
}

export function clearAletheiaDelegatedPresenceState(host: AletheiaDelegatedPresenceHost): void {
  host.setSnapshot(undefined);
}
