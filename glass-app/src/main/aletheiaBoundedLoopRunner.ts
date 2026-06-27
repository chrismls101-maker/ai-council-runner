/**
 * Aletheia bounded loop runner (B2.3) — terminal investigation loop.
 */

import type { ActionConfirmation, ActionIntent } from "../shared/aletheiaExecution.ts";
import { narrationForStage } from "../shared/aletheiaExecution.ts";
import {
  appendBoundedLoopAudit,
  buildBoundedLoopSummary,
  buildTerminalInvestigationScope,
  finalizeBoundedLoopSnapshot,
  initialBoundedLoopSnapshot,
  readBoundedLoopConfig,
  type AletheiaBoundedLoopSnapshot,
} from "../shared/aletheiaBoundedAutonomy.ts";
import { executeActionIntent, verifyActionResult } from "./aletheiaActionExecutor.ts";
import { appendActionLedgerEntry } from "./aletheiaActionLedgerStore.ts";

export interface AletheiaBoundedLoopHost {
  getSnapshot: () => AletheiaBoundedLoopSnapshot | undefined;
  setSnapshot: (snapshot: AletheiaBoundedLoopSnapshot | undefined) => void;
  getLedgerAttribution?: () => string | undefined;
  push: () => void;
}

export async function runAletheiaBoundedTerminalLoop(
  host: AletheiaBoundedLoopHost,
  intent: ActionIntent,
  confirmation: ActionConfirmation,
): Promise<{ ok: boolean; summary: string }> {
  const config = readBoundedLoopConfig(intent.payload);
  const command = String(intent.payload.command ?? "").trim();
  if (!config || !command) {
    return { ok: false, summary: "Bounded loop could not start — missing command or scope." };
  }

  const targetApp =
    typeof intent.payload.targetApp === "string" ? intent.payload.targetApp : undefined;
  const scope = buildTerminalInvestigationScope(
    command,
    targetApp,
    config.maxIterations,
  );

  let snapshot = initialBoundedLoopSnapshot(scope);
  host.setSnapshot(snapshot);
  host.push();

  const attribution = host.getLedgerAttribution?.() ?? null;

  appendActionLedgerEntry({
    intent,
    stage: "planning",
    narration: `${scope.declaration} Confirmed by ${confirmation.confirmedBy}.`,
    ok: true,
    attribution,
  });

  let finalOk = false;

  for (let iteration = 1; iteration <= scope.maxIterations; iteration += 1) {
    appendActionLedgerEntry({
      intent,
      stage: "executing",
      narration: `Bounded loop iteration ${iteration}/${scope.maxIterations}: running command.`,
      ok: null,
      attribution,
    });

    const loopIntent: ActionIntent = {
      ...intent,
      summary: intent.summary,
      payload: { ...intent.payload, boundedLoop: undefined },
    };

    const rawResult = await executeActionIntent(loopIntent);
    const verified = await verifyActionResult(loopIntent, rawResult);
    finalOk = verified.ok;

    appendActionLedgerEntry({
      intent,
      stage: verified.ok ? "verifying" : "executing",
      narration: verified.ok
        ? `Iteration ${iteration} succeeded.`
        : `Iteration ${iteration} failed: ${verified.errorMessage ?? verified.output ?? "unknown error"}`,
      ok: verified.ok,
      errorMessage: verified.ok ? null : verified.errorMessage ?? null,
      attribution,
    });

    snapshot = appendBoundedLoopAudit(snapshot, {
      iteration,
      narration: verified.ok
        ? `Iteration ${iteration} succeeded.`
        : `Iteration ${iteration} failed.`,
      ok: verified.ok,
      detail: verified.output ?? verified.errorMessage,
    });
    host.setSnapshot(snapshot);
    host.push();

    if (verified.ok) break;
  }

  const summary = buildBoundedLoopSummary(scope, snapshot.audit, finalOk);
  snapshot = finalizeBoundedLoopSnapshot(snapshot, { ok: finalOk, summary });
  host.setSnapshot(snapshot);
  host.push();

  appendActionLedgerEntry({
    intent,
    stage: finalOk ? "complete" : "failed",
    narration: narrationForStage(intent, finalOk ? "complete" : "failed", {
      intentId: intent.id,
      ok: finalOk,
      output: summary,
      executedAt: Date.now(),
      durationMs: 0,
      rollbackAvailable: false,
    }),
    ok: finalOk,
    errorMessage: finalOk ? null : summary,
    attribution,
  });

  return { ok: finalOk, summary };
}
