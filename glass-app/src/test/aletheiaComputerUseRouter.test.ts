import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isAppleScriptCapableApp,
  selectComputerUseRoute,
  formatComputerUseRouteNarration,
} from "../shared/aletheiaComputerUseRouter.ts";

describe("selectComputerUseRoute", () => {
  test("type_text prefers applescript when Cursor + accessibility", () => {
    const route = selectComputerUseRoute({
      operation: "type_text",
      targetApp: "Cursor",
      accessibilityGranted: true,
      isPlainText: true,
    });
    assert.equal(route.tier, "applescript");
    assert.equal(route.fallbackTier, "cgevent");
  });

  test("type_text falls back to cgevent for unknown app", () => {
    const route = selectComputerUseRoute({
      operation: "type_text",
      targetApp: "UnknownAppXYZ",
      accessibilityGranted: true,
      isPlainText: true,
    });
    assert.equal(route.tier, "cgevent");
  });

  test("press_shortcut uses applescript for known app with accessibility", () => {
    const route = selectComputerUseRoute({
      operation: "press_shortcut",
      targetApp: "Safari",
      accessibilityGranted: true,
    });
    assert.equal(route.tier, "applescript");
    assert.equal(route.fallbackTier, "cgevent");
  });

  test("click_target prefers accessibility when AX target present", () => {
    const route = selectComputerUseRoute({
      operation: "click_target",
      accessibilityGranted: true,
      hasAxTarget: true,
      hasVisionTarget: true,
    });
    assert.equal(route.tier, "accessibility");
    assert.equal(route.fallbackTier, "vision");
  });

  test("click_target uses vision when AX missing but coordinates exist", () => {
    const route = selectComputerUseRoute({
      operation: "click_target",
      accessibilityGranted: false,
      hasAxTarget: false,
      hasVisionTarget: true,
    });
    assert.equal(route.tier, "vision");
    assert.equal(route.fallbackTier, "cgevent");
  });

  test("activate_app always routes through applescript", () => {
    const route = selectComputerUseRoute({
      operation: "activate_app",
      targetApp: "Mail",
      accessibilityGranted: true,
    });
    assert.equal(route.tier, "applescript");
  });
});

describe("isAppleScriptCapableApp", () => {
  test("recognizes known apps case-insensitively", () => {
    assert.ok(isAppleScriptCapableApp("cursor"));
    assert.ok(isAppleScriptCapableApp("Google Chrome"));
    assert.ok(!isAppleScriptCapableApp("RandomWidget"));
  });
});

describe("formatComputerUseRouteNarration", () => {
  test("includes method and success state", () => {
    const text = formatComputerUseRouteNarration({
      ok: true,
      message: "Typed 12 chars.",
      tier: "applescript",
      method: "AppleScript activate + CGEvent type",
    });
    assert.match(text, /AppleScript activate \+ CGEvent type succeeded/);
    assert.match(text, /Typed 12 chars/);
  });
});
