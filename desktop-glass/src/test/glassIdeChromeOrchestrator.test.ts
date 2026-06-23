import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyIdeChromeSignal,
  GLASS_IDE_TERMINAL_AUTO_COLLAPSE_MS,
  GLASS_IDE_TERMINAL_MANUAL_OVERRIDE_MS,
  initialIdeChromeOrchestratorState,
  isPtyErrorLine,
  shouldAutoCollapseNow,
  shouldExpandForToolStart,
} from "../shared/glassIdeChromeOrchestrator.ts";

describe("glassIdeChromeOrchestrator", () => {
  it("starts collapsed on ide-opened", () => {
    const effect = applyIdeChromeSignal(
      { ...initialIdeChromeOrchestratorState(), expanded: true },
      { kind: "ide-opened" },
      1000,
    );
    assert.equal(effect.expanded, false);
    assert.equal(effect.cancelAutoCollapse, true);
  });

  it("expands on shell tool start", () => {
    const state = initialIdeChromeOrchestratorState();
    const effect = applyIdeChromeSignal(
      state,
      { kind: "agent-tool-start", toolName: "bash" },
      1000,
    );
    assert.equal(effect.expanded, true);
    assert.equal(shouldExpandForToolStart("bash"), true);
    assert.equal(shouldExpandForToolStart("read_file"), false);
  });

  it("manual override blocks auto expand", () => {
    const state = {
      ...initialIdeChromeOrchestratorState(),
      manualOverrideUntil: 5000,
    };
    const effect = applyIdeChromeSignal(
      state,
      { kind: "agent-tool-start", toolName: "bash" },
      1000,
    );
    assert.equal(effect.expanded, false);
  });

  it("schedules auto-collapse after successful post-run when idle", () => {
    const state = { ...initialIdeChromeOrchestratorState(), expanded: true };
    const effect = applyIdeChromeSignal(
      state,
      { kind: "post-run-complete", success: true },
      10_000,
    );
    assert.equal(effect.scheduleAutoCollapse, true);
    assert.equal(effect.expanded, true);
  });

  it("never auto-collapses after failure", () => {
    const state = {
      ...initialIdeChromeOrchestratorState(),
      expanded: true,
      runFailed: true,
    };
    assert.equal(shouldAutoCollapseNow(state, 99_000), false);
    const effect = applyIdeChromeSignal(
      state,
      { kind: "post-run-complete", success: false },
      10_000,
    );
    assert.equal(effect.runFailed, true);
    assert.equal(effect.cancelAutoCollapse, true);
  });

  it("terminal interaction cancels scheduled collapse window", () => {
    const state = { ...initialIdeChromeOrchestratorState(), expanded: true };
    const effect = applyIdeChromeSignal(state, { kind: "terminal-interaction" }, 5000);
    assert.equal(effect.lastTerminalInteractionAt, 5000);
    assert.equal(effect.cancelAutoCollapse, true);
    assert.equal(
      shouldAutoCollapseNow({ ...state, lastTerminalInteractionAt: 5000 }, 5000 + 1000),
      false,
    );
    assert.equal(
      shouldAutoCollapseNow({ ...state, lastTerminalInteractionAt: 5000 }, 5000 + GLASS_IDE_TERMINAL_AUTO_COLLAPSE_MS),
      true,
    );
  });

  it("user manual toggle sets override window", () => {
    const effect = applyIdeChromeSignal(
      initialIdeChromeOrchestratorState(),
      { kind: "user-set-expanded", expanded: true, manual: true },
      1000,
    );
    assert.equal(effect.expanded, true);
    assert.equal(effect.manualOverrideUntil, 1000 + GLASS_IDE_TERMINAL_MANUAL_OVERRIDE_MS);
  });

  it("detects pty error lines", () => {
    assert.equal(isPtyErrorLine("TypeError: foo is not a function"), true);
    assert.equal(isPtyErrorLine("all good"), false);
  });
});
