/**
 * Main-process adapters for AletheiaActionOrchestrator (P0.1).
 */

import type { ActionIntent, ActionResult } from "../shared/aletheiaExecution.ts";
import type { ActionExecutorPort, ActionLedgerPort } from "../shared/aletheiaActionOrchestrator.ts";
import {
  appendActionLedgerEntry,
  appendResultLedgerEntry,
} from "./aletheiaActionLedgerStore.ts";
import { executeActionIntent, verifyActionResult } from "./aletheiaActionExecutor.ts";
import { currentAletheiaSessionId } from "./companionSessionStore.ts";

export function createActionLedgerPort(getAttribution?: () => string | undefined): ActionLedgerPort {
  return {
    appendStage(intent, stage, input) {
      appendActionLedgerEntry({
        intent,
        stage,
        narration: input?.narration,
        ok: input?.ok,
        errorMessage: input?.errorMessage,
        attribution: getAttribution?.() ?? null,
      });
    },
    appendResult(intent, result) {
      appendResultLedgerEntry(intent, result, getAttribution?.() ?? null);
    },
  };
}

export const defaultActionLedgerPort: ActionLedgerPort = createActionLedgerPort();

export const defaultActionExecutorPort: ActionExecutorPort = {
  execute: executeActionIntent,
  verify: verifyActionResult,
};

export function currentAletheiaActionSessionId(): string {
  return currentAletheiaSessionId() ?? "glass-no-session";
}

export type { ActionExecutorPort, ActionLedgerPort, AletheiaActionOrchestratorHost } from "../shared/aletheiaActionOrchestrator.ts";
export { AletheiaActionOrchestrator } from "../shared/aletheiaActionOrchestrator.ts";
