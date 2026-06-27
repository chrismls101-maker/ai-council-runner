/**
 * AletheiaActionOrchestrator — in-process tests with mock ports (P0.1).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AletheiaActionOrchestrator,
  type ActionExecutorPort,
  type ActionLedgerPort,
} from "../shared/aletheiaActionOrchestrator.ts";
import type { ActionIntent, ActionResult, AletheiaActionPipelineSnapshot } from "../shared/aletheiaExecution.ts";

function mockExecutor(result: Partial<ActionResult> = {}): ActionExecutorPort {
  return {
    async execute(intent) {
      return {
        intentId: intent.id,
        ok: true,
        output: "mock executed",
        executedAt: Date.now(),
        durationMs: 1,
        rollbackAvailable: false,
        ...result,
      };
    },
    async verify(_intent, res) {
      return res;
    },
  };
}

function memoryLedger(): { port: ActionLedgerPort; entries: ActionIntent[] } {
  const entries: ActionIntent[] = [];
  return {
    entries,
    port: {
      appendStage(intent) {
        entries.push(intent);
      },
      appendResult(intent) {
        entries.push(intent);
      },
    },
  };
}

test("user-initiated write-file completes pipeline with ok actionResult", async () => {
  let snapshot: AletheiaActionPipelineSnapshot | undefined;
  let actionResult:
    | { id: string; type: string; status: string; message: string }
    | undefined;

  const orchestrator = new AletheiaActionOrchestrator(
    {
      getPipelineSnapshot: () => snapshot,
      setPipelineSnapshot: (next) => {
        snapshot = next;
      },
      setActionResult: (input) => {
        actionResult = input;
      },
      getSessionId: () => "test-session",
      push: () => {},
    },
    memoryLedger().port,
    mockExecutor(),
  );

  await orchestrator.runWriteFile({
    path: "~/Desktop/glass-orchestrator-test.md",
    content: "# test",
    id: "test-write-1",
    userInitiated: true,
  });

  assert.equal(actionResult?.id, "test-write-1");
  assert.equal(actionResult?.status, "ok");
  assert.equal(snapshot?.pendingConfirmation, undefined);
  assert.equal(snapshot?.lastResult?.ok, true);
});

test("unconfirmed intent stops at awaiting-confirmation", async () => {
  let snapshot: AletheiaActionPipelineSnapshot | undefined;

  const orchestrator = new AletheiaActionOrchestrator(
    {
      getPipelineSnapshot: () => snapshot,
      setPipelineSnapshot: (next) => {
        snapshot = next;
      },
      setActionResult: () => {},
      getSessionId: () => "test-session",
      push: () => {},
    },
    memoryLedger().port,
    mockExecutor(),
  );

  await orchestrator.runWriteFile({
    path: "~/Desktop/pending.md",
    content: "pending",
    id: "test-write-2",
    userInitiated: false,
  });

  assert.ok(snapshot?.pendingConfirmation);
  assert.equal(snapshot?.pendingConfirmation?.glassActionId, "test-write-2");
});

test("modifyAction revises pending shell command", async () => {
  let snapshot: AletheiaActionPipelineSnapshot | undefined;
  const { intentFromShell } = await import("../shared/aletheiaExecution.ts");

  const orchestrator = new AletheiaActionOrchestrator(
    {
      getPipelineSnapshot: () => snapshot,
      setPipelineSnapshot: (next) => {
        snapshot = next;
      },
      setActionResult: () => {},
      getSessionId: () => "test-session",
      push: () => {},
    },
    memoryLedger().port,
    mockExecutor(),
  );

  await orchestrator.proposeIntent(
    intentFromShell({ command: "npm test", sessionId: "test-session" }),
  );

  const intentId = snapshot?.pendingConfirmation?.intentId;
  assert.ok(intentId);

  await orchestrator.modifyAction(intentId!, "change it to npm run lint");
  assert.equal(snapshot?.pendingConfirmation?.commandPreview, "npm run lint");
});

test("proposeIntent stops at awaiting-confirmation", async () => {
  let snapshot: AletheiaActionPipelineSnapshot | undefined;
  const { intentFromShell } = await import("../shared/aletheiaExecution.ts");

  const orchestrator = new AletheiaActionOrchestrator(
    {
      getPipelineSnapshot: () => snapshot,
      setPipelineSnapshot: (next) => {
        snapshot = next;
      },
      setActionResult: () => {},
      getSessionId: () => "test-session",
      push: () => {},
    },
    memoryLedger().port,
    mockExecutor(),
  );

  await orchestrator.proposeIntent(
    intentFromShell({ command: "npm test", sessionId: "test-session" }),
  );

  assert.ok(snapshot?.pendingConfirmation);
  assert.equal(snapshot?.pendingConfirmation?.targetDescription, "Glass shell");
});

test("deployed execution auto-confirms shell intent without pending confirmation", async () => {
  let snapshot: AletheiaActionPipelineSnapshot | undefined;
  let actionResult:
    | { id: string; type: string; status: string; message: string }
    | undefined;
  const { intentFromShell } = await import("../shared/aletheiaExecution.ts");

  const orchestrator = new AletheiaActionOrchestrator(
    {
      getPipelineSnapshot: () => snapshot,
      setPipelineSnapshot: (next) => {
        snapshot = next;
      },
      setActionResult: (input) => {
        actionResult = input;
      },
      getSessionId: () => "test-session",
      getDeployedExecutionActive: () => true,
      push: () => {},
    },
    memoryLedger().port,
    mockExecutor(),
  );

  await orchestrator.proposeIntent(
    intentFromShell({ command: "npm test", sessionId: "test-session", glassActionId: "deployed-shell" }),
  );

  assert.equal(snapshot?.pendingConfirmation, undefined);
  assert.equal(snapshot?.lastResult?.ok, true);
  assert.equal(actionResult?.status, "ok");
});

test("confirmAction executes pending intent", async () => {
  let snapshot: AletheiaActionPipelineSnapshot | undefined;
  let actionResult:
    | { id: string; type: string; status: string; message: string }
    | undefined;

  const orchestrator = new AletheiaActionOrchestrator(
    {
      getPipelineSnapshot: () => snapshot,
      setPipelineSnapshot: (next) => {
        snapshot = next;
      },
      setActionResult: (input) => {
        actionResult = input;
      },
      getSessionId: () => "test-session",
      push: () => {},
    },
    memoryLedger().port,
    mockExecutor(),
  );

  await orchestrator.runWriteFile({
    path: "~/Desktop/confirm-me.md",
    content: "confirmed",
    id: "test-write-3",
    userInitiated: false,
  });

  const intentId = snapshot?.pendingConfirmation?.intentId;
  assert.ok(intentId);

  await orchestrator.confirmAction(intentId!, "user-tap");

  assert.equal(snapshot?.pendingConfirmation, undefined);
  assert.equal(actionResult?.status, "ok");
});
