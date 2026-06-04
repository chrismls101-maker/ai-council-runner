import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatOverlayAnswerText,
  isCouncilFormattedAnswer,
} from "../shared/glassAskTypes.ts";
import {
  formatDisplayTargetLabel,
  GLASS_HOTKEY_PRESETS,
  parseHotkeyPreset,
} from "../shared/glassSettings.ts";
import { buildRunHistoryUrl, DEFAULT_CONFIG } from "../shared/config.ts";

test("formatOverlayAnswerText strips markdown headers", () => {
  const out = formatOverlayAnswerText("## Summary\n- one\n- two");
  assert.doesNotMatch(out, /^##/);
  assert.match(out, /- one/);
});

test("isCouncilFormattedAnswer detects council markers", () => {
  assert.equal(isCouncilFormattedAnswer("Final Action Plan\n- step"), true);
  assert.equal(isCouncilFormattedAnswer("You are editing the overlay."), false);
});

test("parseHotkeyPreset defaults to cmd-shift-space", () => {
  assert.equal(parseHotkeyPreset(undefined), "cmd-shift-space");
  assert.equal(parseHotkeyPreset("disabled"), "disabled");
});

test("GLASS_HOTKEY_PRESETS disabled has no accelerator", () => {
  assert.equal(GLASS_HOTKEY_PRESETS.disabled.accelerator, null);
});

test("formatDisplayTargetLabel describes primary and follow mouse", () => {
  assert.match(formatDisplayTargetLabel("primary"), /Primary Display/);
  assert.match(formatDisplayTargetLabel("follow_mouse"), /Follow Mouse/);
});

test("buildRunHistoryUrl encodes run id", () => {
  assert.equal(
    buildRunHistoryUrl(DEFAULT_CONFIG, "run-123"),
    "http://localhost:5173/?runId=run-123",
  );
});
