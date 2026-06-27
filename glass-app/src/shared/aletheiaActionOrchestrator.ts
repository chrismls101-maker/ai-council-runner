/**
 * AletheiaActionOrchestrator — unified trust/execution pipeline (P0.1 Binding).
 *
 * Pipeline: intent → plan → confirmation → execution → verification → report-back
 */

import type {
  ActionConfirmation,
  ActionIntent,
  ActionResult,
  AletheiaActionPipelineSnapshot,
  PipelineState,
} from "../shared/aletheiaExecution.ts";
import {
  applyActionModifier,
  buildPendingConfirmationView,
  confirmationFromUserTap,
  intentFromKeystrokes,
  intentFromWriteFile,
  narrationForStage,
  pipelineState,
} from "../shared/aletheiaExecution.ts";
import { passAuthorityGate } from "../shared/aletheiaAuthorityGate.ts";
import { canExecuteActionOnPermissionPlane } from "../shared/aletheiaPermissionControlPlane.ts";
import type { AletheiaPermissionControlPlaneSnapshot } from "../shared/aletheiaPermissionControlPlane.ts";

export interface ActionLedgerPort {
  appendStage(
    intent: ActionIntent,
    stage: PipelineState["stage"],
    input?: { narration?: string; ok?: boolean | null; errorMessage?: string | null },
  ): void;
  appendResult(intent: ActionIntent, result: ActionResult): void;
}

export interface ActionExecutorPort {
  execute(intent: ActionIntent): Promise<ActionResult>;
  verify(intent: ActionIntent, result: ActionResult): Promise<ActionResult>;
}

export interface AletheiaActionOrchestratorHost {
  getPipelineSnapshot: () => AletheiaActionPipelineSnapshot | undefined;
  setPipelineSnapshot: (snapshot: AletheiaActionPipelineSnapshot | undefined) => void;
  setActionResult: (input: {
    id: string;
    type: "write-file" | "inject-keystrokes";
    status: "ok" | "error" | "pending";
    message: string;
  }) => void;
  getSessionId: () => string;
  getPermissionPlane?: () => AletheiaPermissionControlPlaneSnapshot | undefined;
  push: () => void;
}

export class AletheiaActionOrchestrator {
  private pendingIntents = new Map<string, ActionIntent>();
  private readonly host: AletheiaActionOrchestratorHost;
  private readonly ledger: ActionLedgerPort;
  private readonly executor: ActionExecutorPort;

  constructor(
    host: AletheiaActionOrchestratorHost,
    ledger: ActionLedgerPort,
    executor: ActionExecutorPort,
  ) {
    this.host = host;
    this.ledger = ledger;
    this.executor = executor;
  }

  private syncPipeline(update: Partial<AletheiaActionPipelineSnapshot>): void {
    this.host.setPipelineSnapshot({
      ...(this.host.getPipelineSnapshot() ?? {}),
      ...update,
    });
  }

  private recordStage(intent: ActionIntent, stage: PipelineState["stage"]): PipelineState {
    const narration = narrationForStage(intent, stage);
    this.ledger.appendStage(intent, stage, { narration });
    const state = pipelineState(intent.id, stage, narration);
    this.syncPipeline({ active: state });
    return state;
  }

  async runWriteFile(input: {
    path: string;
    content: string;
    id: string;
    userInitiated?: boolean;
  }): Promise<void> {
    const intent = intentFromWriteFile({
      ...input,
      sessionId: this.host.getSessionId(),
    });
    await this.runPipeline(intent, input.userInitiated ? confirmationFromUserTap(intent.id) : undefined);
  }

  async runInjectKeystrokes(input: {
    text: string;
    id: string;
    targetApp?: string;
    userInitiated?: boolean;
  }): Promise<void> {
    const intent = intentFromKeystrokes({
      ...input,
      sessionId: this.host.getSessionId(),
    });
    await this.runPipeline(intent, input.userInitiated ? confirmationFromUserTap(intent.id) : undefined);
  }

  /** Propose an intent that stops at awaiting-confirmation (B2.2). */
  async proposeIntent(intent: ActionIntent): Promise<void> {
    await this.runPipeline(intent, undefined);
  }

  async modifyAction(intentId: string, modifier: string): Promise<void> {
    const intent = this.pendingIntents.get(intentId);
    if (!intent) return;

    const revised = applyActionModifier(intent, modifier);
    this.pendingIntents.set(intentId, revised);
    const awaiting = this.recordStage(revised, "awaiting-confirmation");
    this.syncPipeline({
      pendingConfirmation: buildPendingConfirmationView(revised, awaiting.narration),
    });
    this.host.push();
  }

  async confirmAction(intentId: string, confirmedBy: ActionConfirmation["confirmedBy"] = "user-tap"): Promise<void> {
    const intent = this.pendingIntents.get(intentId);
    if (!intent) {
      const pendingKind = this.host.getPipelineSnapshot()?.pendingConfirmation?.kind;
      this.host.setActionResult({
        id: intentId,
        type: pendingKind === "keystroke" ? "inject-keystrokes" : "write-file",
        status: "error",
        message: "No pending action found for confirmation.",
      });
      this.host.push();
      return;
    }
    await this.runPipeline(intent, {
      intentId,
      confirmedAt: Date.now(),
      confirmedBy,
    });
  }

  async rejectAction(intentId: string): Promise<void> {
    const intent = this.pendingIntents.get(intentId);
    this.pendingIntents.delete(intentId);
    if (intent) {
      this.ledger.appendStage(intent, "failed", {
        narration: "Action rejected by user.",
        ok: false,
        errorMessage: "User rejected action.",
      });
    }
    this.syncPipeline({
      pendingConfirmation: undefined,
      active: pipelineState(intentId, "failed", "Action rejected."),
      lastResult: {
        intentId,
        stage: "failed",
        narration: "Action rejected.",
        ok: false,
        message: "Action rejected.",
        updatedAt: Date.now(),
      },
    });
    this.host.push();
  }

  private async runPipeline(
    intent: ActionIntent,
    confirmation: ActionConfirmation | undefined,
  ): Promise<void> {
    this.pendingIntents.delete(intent.id);

    this.recordStage(intent, "intent");
    this.recordStage(intent, "planning");

    const gate = passAuthorityGate(intent, confirmation);
    if (!gate.ok) {
      if (!confirmation) {
        this.pendingIntents.set(intent.id, intent);
        const awaiting = this.recordStage(intent, "awaiting-confirmation");
        this.syncPipeline({
          pendingConfirmation: buildPendingConfirmationView(intent, awaiting.narration),
        });
        if (intent.glassActionId) {
          this.host.setActionResult({
            id: intent.glassActionId,
            type: intent.kind === "keystroke" ? "inject-keystrokes" : "write-file",
            status: "pending",
            message: awaiting.narration,
          });
        }
        this.host.push();
        return;
      }

      this.recordStage(intent, "failed");
      this.ledger.appendStage(intent, "failed", {
        narration: gate.reason,
        ok: false,
        errorMessage: gate.reason,
      });
      if (intent.glassActionId) {
        this.host.setActionResult({
          id: intent.glassActionId,
          type: intent.kind === "keystroke" ? "inject-keystrokes" : "write-file",
          status: "error",
          message: gate.reason,
        });
      }
      this.syncPipeline({
        pendingConfirmation: undefined,
        lastResult: {
          intentId: intent.id,
          stage: "failed",
          narration: gate.reason,
          ok: false,
          message: gate.reason,
          updatedAt: Date.now(),
          glassActionId: intent.glassActionId,
        },
      });
      this.host.push();
      return;
    }

    this.ledger.appendStage(intent, "awaiting-confirmation", {
      narration: `Confirmed by ${confirmation!.confirmedBy}.`,
      ok: true,
    });

    const permissionGate = canExecuteActionOnPermissionPlane(
      intent.kind,
      this.host.getPermissionPlane?.(),
    );
    if (!permissionGate.ok) {
      this.recordStage(intent, "failed");
      this.ledger.appendStage(intent, "failed", {
        narration: permissionGate.reason,
        ok: false,
        errorMessage: permissionGate.reason,
      });
      if (intent.glassActionId) {
        this.host.setActionResult({
          id: intent.glassActionId,
          type: intent.kind === "keystroke" ? "inject-keystrokes" : "write-file",
          status: "error",
          message: permissionGate.reason,
        });
      }
      this.syncPipeline({
        pendingConfirmation: undefined,
        lastResult: {
          intentId: intent.id,
          stage: "failed",
          narration: permissionGate.reason,
          ok: false,
          message: permissionGate.reason,
          updatedAt: Date.now(),
          glassActionId: intent.glassActionId,
        },
      });
      this.host.push();
      return;
    }

    this.recordStage(intent, "executing");
    const rawResult = await this.executor.execute(intent);
    this.recordStage(intent, "verifying");
    const verified = await this.executor.verify(intent, rawResult);
    this.ledger.appendResult(intent, verified);

    const finalStage = verified.ok ? "complete" : "failed";
    const report = this.recordStage(intent, finalStage);

    if (intent.glassActionId) {
      this.host.setActionResult({
        id: intent.glassActionId,
        type: intent.kind === "keystroke" ? "inject-keystrokes" : "write-file",
        status: verified.ok ? "ok" : "error",
        message: verified.output ?? verified.errorMessage ?? report.narration,
      });
    }

    this.syncPipeline({
      pendingConfirmation: undefined,
      lastResult: {
        intentId: intent.id,
        stage: finalStage,
        narration: report.narration,
        ok: verified.ok,
        message: verified.output ?? verified.errorMessage ?? report.narration,
        updatedAt: Date.now(),
        glassActionId: intent.glassActionId,
      },
    });
    this.host.push();
  }
}
