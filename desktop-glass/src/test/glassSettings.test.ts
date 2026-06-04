import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GLASS_USER_SETTINGS,
  formatDisplayTargetLabel,
  parseDisplayTarget,
  parseHotkeyPreset,
  serializeDisplayTarget,
} from "../shared/glassSettings.ts";

test("default settings use cmd-shift-space and primary display", () => {
  assert.equal(DEFAULT_GLASS_USER_SETTINGS.hotkeyPreset, "cmd-shift-space");
  assert.equal(DEFAULT_GLASS_USER_SETTINGS.displayTarget, "primary");
});

test("parseDisplayTarget parses numeric ids", () => {
  assert.equal(parseDisplayTarget("42"), 42);
  assert.equal(parseDisplayTarget("follow_mouse"), "follow_mouse");
});

test("serializeDisplayTarget round trips primary", () => {
  assert.equal(serializeDisplayTarget("primary"), "primary");
  assert.equal(serializeDisplayTarget(99), "99");
});

test("formatDisplayTargetLabel numbers displays", () => {
  assert.equal(formatDisplayTargetLabel(10, [10, 20]), "Display 1");
});
