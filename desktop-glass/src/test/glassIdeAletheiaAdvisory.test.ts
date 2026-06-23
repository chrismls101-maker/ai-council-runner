import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeAletheiaAdvisory,
  deriveAletheiaRunPhase,
  deriveIdeInFlow,
  gateChromeExpandSignal,
  GLASS_IDE_STUCK_FIX_ROUNDS,
  isAutoExpandChromeSignal,
} from "../shared/glassIdeAletheiaAdvisory.ts";

describe("glassIdeAletheiaAdvisory", () => {
  it("detects in-flow from recent editor activity", () => {
    const now = 10_000;
    assert.equal(deriveIdeInFlow(now, now - 1_000), true);
    assert.equal(deriveIdeInFlow(now, now - 20_000), false);
  });

  it("suppresses auto-expand while in flow", () => {
    const now = 10_000;
    const gate = gateChromeExpandSignal({
      signal: { kind: "pty-error" },
      now,
      editorUpdatedAt: now - 500,
      terminalInteractionAt: 0,
    });
    assert.equal(gate.allow, false);
    assert.equal(isAutoExpandChromeSignal({ kind: "pty-error" }), true);
    assert.equal(isAutoExpandChromeSignal({ kind: "user-set-expanded", expanded: true }), false);
  });

  it("defers auto-expand after editor was recently active", () => {
    const now = 20_000;
    const gate = gateChromeExpandSignal({
      signal: { kind: "qa-shell-check-start" },
      now,
      editorUpdatedAt: now - 12_000,
      terminalInteractionAt: 0,
    });
    assert.equal(gate.allow, true);
    assert.ok(gate.deferMs > 0);
  });

  it("emits feed line on failed phase transition", () => {
    const result = computeAletheiaAdvisory({
      now: 1,
      editorUpdatedAt: 0,
      phase: "failed",
      prevPhase: "running",
      agentRunning: false,
      hasFailure: true,
      loopIteration: 1,
      errorHint: "Type error in src/foo.ts",
      firstErrorHintShown: false,
      lastSpokenErrorSignature: null,
      feedLineCounter: 0,
      spokenNonce: 0,
    });
    assert.ok(result.snapshot.feedLine);
    assert.match(result.snapshot.feedLine!.label, /failed/i);
    assert.ok(result.snapshot.spokenText);
    assert.equal(result.markFirstErrorHintShown, true);
  });

  it("spoken stuck hint only after fix rounds", () => {
    const stuck = computeAletheiaAdvisory({
      now: 1,
      editorUpdatedAt: 0,
      phase: "failed",
      prevPhase: "failed",
      agentRunning: false,
      hasFailure: true,
      loopIteration: GLASS_IDE_STUCK_FIX_ROUNDS,
      errorHint: "same error",
      firstErrorHintShown: true,
      lastSpokenErrorSignature: null,
      feedLineCounter: 1,
      spokenNonce: 1,
    });
    assert.ok(stuck.snapshot.spokenText);
    assert.match(stuck.snapshot.spokenText!, /Fix all/i);

    const early = computeAletheiaAdvisory({
      now: 1,
      editorUpdatedAt: 0,
      phase: "failed",
      prevPhase: "failed",
      agentRunning: false,
      hasFailure: true,
      loopIteration: 1,
      errorHint: "same error",
      firstErrorHintShown: true,
      lastSpokenErrorSignature: null,
      feedLineCounter: 1,
      spokenNonce: 1,
    });
    assert.equal(early.snapshot.spokenText, null);
  });

  it("derives run phase from agent and QA state", () => {
    assert.equal(
      deriveAletheiaRunPhase({
        agentRunning: true,
        agentFailed: false,
        qaHasFail: false,
        verifyFailed: false,
        agentDone: false,
        qaRunning: false,
      }),
      "running",
    );
    assert.equal(
      deriveAletheiaRunPhase({
        agentRunning: false,
        agentFailed: false,
        qaHasFail: true,
        verifyFailed: false,
        agentDone: true,
        qaRunning: false,
      }),
      "failed",
    );
  });
});
