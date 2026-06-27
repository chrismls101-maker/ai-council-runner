import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  appendBoundedLoopAudit,
  buildBoundedLoopSummary,
  buildTerminalInvestigationScope,
  finalizeBoundedLoopSnapshot,
  initialBoundedLoopSnapshot,
  readBoundedLoopConfig,
} from "../shared/aletheiaBoundedAutonomy.ts";
import { intentFromAdviceApproval } from "../shared/aletheiaExecution.ts";

describe("buildTerminalInvestigationScope", () => {
  test("declares iteration cap and allowed actions", () => {
    const scope = buildTerminalInvestigationScope("npm test", "Cursor", 3);
    assert.match(scope.declaration, /3 times/);
    assert.equal(scope.allowedActions.length, 4);
    assert.equal(scope.command, "npm test");
  });
});

describe("buildBoundedLoopSummary", () => {
  test("summarizes successful early stop", () => {
    const scope = buildTerminalInvestigationScope("npm test", undefined, 3);
    const audit = [
      {
        id: "a1",
        iteration: 1,
        narration: "failed",
        ok: false,
        createdAt: Date.now(),
      },
      {
        id: "a2",
        iteration: 2,
        narration: "passed",
        ok: true,
        detail: "all tests passed",
        createdAt: Date.now(),
      },
    ];
    const summary = buildBoundedLoopSummary(scope, audit, true);
    assert.match(summary, /2 iterations/);
    assert.match(summary, /now passes/);
  });
});

describe("bounded loop snapshot helpers", () => {
  test("appendBoundedLoopAudit grows audit trail", () => {
    const scope = buildTerminalInvestigationScope("npm test");
    let snapshot = initialBoundedLoopSnapshot(scope);
    snapshot = appendBoundedLoopAudit(snapshot, {
      iteration: 1,
      narration: "running",
      ok: null,
    });
    assert.equal(snapshot.audit.length, 1);
    snapshot = finalizeBoundedLoopSnapshot(snapshot, {
      ok: false,
      summary: "Still failing.",
    });
    assert.equal(snapshot.phase, "failed");
    assert.equal(snapshot.summary, "Still failing.");
  });
});

describe("intentFromAdviceApproval bounded loop payload", () => {
  test("tags terminal advice intents for bounded investigation", () => {
    const intent = intentFromAdviceApproval({
      sessionId: "s1",
      adviceId: "advice-1",
      kind: "terminal_error",
      headline: "Error",
      body: "Terminal shows a failure.",
      command: "npm test",
      targetApp: "Cursor",
    });
    assert.ok(intent);
    const config = readBoundedLoopConfig(intent!.payload);
    assert.equal(config?.kind, "terminal_investigation");
    assert.equal(config?.maxIterations, 3);
    assert.match(config?.scopeDeclaration ?? "", /3 times/);
  });
});
