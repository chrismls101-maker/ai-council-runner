import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GLASS_USER_SETTINGS,
  formatDisplayTargetLabel,
  parseAutoUploadCapturesToContext,
  parseMicAutoSendAfterSilence,
  parseBootSoundEnabled,
  parseSaveVisualAsksToSession,
  parseChromeOrigin,
  parseDisplayTarget,
  parseDockOrientation,
  parseHotkeyPreset,
  serializeDisplayTarget,
} from "../shared/glassSettings.ts";

test("default settings use cmd-shift-space and primary display", () => {
  assert.equal(DEFAULT_GLASS_USER_SETTINGS.hotkeyPreset, "cmd-shift-space");
  assert.equal(DEFAULT_GLASS_USER_SETTINGS.displayTarget, "primary");
  assert.equal(DEFAULT_GLASS_USER_SETTINGS.chromeLayoutLocked, true);
  assert.equal(DEFAULT_GLASS_USER_SETTINGS.dockOrientation, "horizontal");
  assert.equal(DEFAULT_GLASS_USER_SETTINGS.bootSoundEnabled, false);
  assert.equal(DEFAULT_GLASS_USER_SETTINGS.saveVisualAsksToSession, true);
  assert.equal(DEFAULT_GLASS_USER_SETTINGS.autoUploadCapturesToContext, false);
});

test("parseMicAutoSendAfterSilence defaults off", () => {
  assert.equal(parseMicAutoSendAfterSilence(undefined), false);
  assert.equal(parseMicAutoSendAfterSilence(true), true);
});

test("parseSaveVisualAsksToSession and parseAutoUploadCapturesToContext", () => {
  assert.equal(parseSaveVisualAsksToSession(undefined), true);
  assert.equal(parseSaveVisualAsksToSession(false), false);
  assert.equal(parseAutoUploadCapturesToContext(undefined), false);
  assert.equal(parseAutoUploadCapturesToContext(true), true);
});

test("parseBootSoundEnabled defaults to true unless explicitly false", () => {
  assert.equal(parseBootSoundEnabled(undefined), true);
  assert.equal(parseBootSoundEnabled(true), true);
  assert.equal(parseBootSoundEnabled(false), false);
});

test("parseDockOrientation accepts vertical only", () => {
  assert.equal(parseDockOrientation("vertical"), "vertical");
  assert.equal(parseDockOrientation("horizontal"), "horizontal");
  assert.equal(parseDockOrientation(undefined), "horizontal");
});

test("parseChromeOrigin validates numeric coordinates", () => {
  assert.deepEqual(parseChromeOrigin({ x: 10, y: 20 }), { x: 10, y: 20 });
  assert.equal(parseChromeOrigin({ x: "bad", y: 1 }), null);
  assert.equal(parseChromeOrigin(null), null);
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
