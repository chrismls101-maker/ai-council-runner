/**
 * Unit tests for text overlay coordinate conversion and hotkey routing.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTextOverlayCardPlacement,
  screenPointToOverlayLocal,
} from "../shared/textOverlayCoords.ts";
import { textOverlayHotkeyAccelerators } from "../shared/textOverlayHotkeys.ts";
import { usesCommandBar } from "../shared/textOverlayActions.ts";

describe("textOverlayCoords", () => {
  it("maps in-bounds cursor to overlay-local coordinates", () => {
    const local = screenPointToOverlayLocal(
      500,
      400,
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 0, y: 0, width: 1920, height: 1080 },
    );
    assert.equal(local.x, 500);
    assert.equal(local.y, 400);
  });

  it("keeps cards above command bar when cursor sits on the bar", () => {
    const placement = resolveTextOverlayCardPlacement({
      cursorX: 960,
      cursorY: 1020,
      viewportWidth: 1920,
      viewportHeight: 1080,
      bottomReservePx: 220,
    });
    assert.ok(placement.bottom != null);
    assert.ok(placement.bottom >= 240);
    assert.equal(placement.left, 960);
  });

  it("anchors off-screen cursor to nearest display center within overlay", () => {
    const local = screenPointToOverlayLocal(
      2560,
      500,
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 1920, y: 0, width: 1920, height: 1080 },
    );
    assert.equal(local.x, 1880);
    assert.ok(local.y > 40 && local.y < 1040);
  });
});

describe("textOverlayHotkeyAccelerators", () => {
  it("uses Alt+Shift+Space when Glass preset owns Alt+Space", () => {
    assert.deepEqual(textOverlayHotkeyAccelerators("alt-space"), ["Alt+Shift+Space"]);
  });

  it("prefers Alt+Space with fallback when Glass uses another preset", () => {
    assert.deepEqual(textOverlayHotkeyAccelerators("cmd-shift-space"), [
      "Alt+Space",
      "Alt+Shift+Space",
    ]);
  });
});

describe("usesCommandBar", () => {
  it("routes open_in_glass through submitAsk, not command bar prefill", () => {
    assert.equal(usesCommandBar("open_in_glass"), false);
    assert.equal(usesCommandBar("draft_reply"), true);
  });
});
