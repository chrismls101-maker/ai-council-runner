import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GLASS_HOTKEY_PRESETS,
  hotkeyRegistrationMessage,
  isValidHotkeyPreset,
  parseHotkeyPreset,
} from "../shared/glassSettings.ts";

test("invalid hotkey preset falls back to default", () => {
  assert.equal(parseHotkeyPreset("not-a-real-preset"), "cmd-shift-space");
  assert.equal(isValidHotkeyPreset("not-a-real-preset"), false);
});

test("disabled hotkey has no accelerator", () => {
  assert.equal(GLASS_HOTKEY_PRESETS.disabled.accelerator, null);
  assert.match(hotkeyRegistrationMessage("disabled", false, null), /disabled/i);
});

test("new presets cmd-shift-i and cmd-alt-i exist", () => {
  assert.equal(GLASS_HOTKEY_PRESETS["cmd-shift-i"].accelerator, "CommandOrControl+Shift+I");
  assert.equal(GLASS_HOTKEY_PRESETS["cmd-alt-i"].accelerator, "CommandOrControl+Alt+I");
});

test("failed registration surfaces diagnostic status", () => {
  const msg = hotkeyRegistrationMessage("cmd-shift-space", false, "CommandOrControl+Shift+Space");
  assert.match(msg, /unavailable/i);
  assert.match(msg, /command bar still clickable/i);
});

test("successful preset registration message includes label", () => {
  const msg = hotkeyRegistrationMessage("alt-space", true, "Alt+Space");
  assert.match(msg, /Alt\+Space/);
  assert.match(msg, /registered/i);
});
