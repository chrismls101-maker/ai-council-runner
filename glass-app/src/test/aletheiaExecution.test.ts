import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { passAuthorityGate, validateActionScope } from "../shared/aletheiaAuthorityGate.ts";
import {
  confirmationFromUserTap,
  intentFromKeystrokes,
  intentFromWriteFile,
  narrationForStage,
  pipelineState,
} from "../shared/aletheiaExecution.ts";

describe("aletheiaAuthorityGate", () => {
  test("blocks execution without confirmation", () => {
    const intent = intentFromWriteFile({
      path: "~/Desktop/test.md",
      content: "hello",
      id: "card-1",
      sessionId: "sess-1",
    });
    const gate = passAuthorityGate(intent, undefined);
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.match(gate.reason, /confirmation/i);
  });

  test("allows execution with matching user-tap confirmation", () => {
    const intent = intentFromWriteFile({
      path: "~/Desktop/test.md",
      content: "hello",
      id: "card-1",
      sessionId: "sess-1",
    });
    const gate = passAuthorityGate(intent, confirmationFromUserTap(intent.id));
    assert.equal(gate.ok, true);
  });

  test("rejects path outside declared scope", () => {
    const intent = intentFromWriteFile({
      path: "~/Desktop/allowed.md",
      content: "hello",
      id: "card-1",
      sessionId: "sess-1",
    });
    intent.payload.path = "/etc/passwd";
    const scope = validateActionScope(intent);
    assert.equal(scope.ok, false);
  });
});

describe("aletheiaExecution narrations", () => {
  test("pipeline stages produce human-readable narration", () => {
    const intent = intentFromKeystrokes({
      text: "hello world",
      id: "card-2",
      sessionId: "sess-1",
      targetApp: "Cursor",
    });
    assert.match(narrationForStage(intent, "intent"), /received your request/i);
    assert.match(narrationForStage(intent, "planning"), /Planning/i);
    assert.match(narrationForStage(intent, "awaiting-confirmation"), /approval/i);
    const state = pipelineState(intent.id, "executing", narrationForStage(intent, "executing"));
    assert.equal(state.intentId, intent.id);
    assert.equal(state.stage, "executing");
  });
});
