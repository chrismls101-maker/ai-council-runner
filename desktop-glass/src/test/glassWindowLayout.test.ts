import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatGlassWindowDiagnostics,
  buildWindowState,
} from "../main/glassWindowDiagnostics.ts";
import { parseOverlayMode } from "../shared/glassWindowTypes.ts";
import {
  dockLayoutFromDisplay,
  overlayLayoutFromDisplay,
  panelLayoutFromDisplay,
  type DisplayLayoutContext,
} from "../shared/glassLayoutMath.ts";

const primaryDisplay: DisplayLayoutContext = {
  id: 1,
  scaleFactor: 2,
  bounds: { x: 0, y: 0, width: 2560, height: 1600 },
  workArea: { x: 0, y: 25, width: 2560, height: 1575 },
};

test("parseOverlayMode accepts known modes and falls back", () => {
  assert.equal(parseOverlayMode("passive"), "passive");
  assert.equal(parseOverlayMode("insights"), "insights");
  assert.equal(parseOverlayMode("hidden"), "hidden");
  assert.equal(parseOverlayMode("bogus"), "passive");
});

test("overlay layout uses workArea so frame is fully visible", () => {
  const overlay = overlayLayoutFromDisplay(primaryDisplay);
  const panel = panelLayoutFromDisplay(primaryDisplay);
  const dock = dockLayoutFromDisplay(primaryDisplay, "compact_dock");

  assert.deepEqual(overlay, primaryDisplay.workArea);
  assert.ok(panel.y >= primaryDisplay.workArea.y);
  assert.ok(dock.y >= primaryDisplay.workArea.y);
});

test("formatGlassWindowDiagnostics includes click-through flag", () => {
  const line = formatGlassWindowDiagnostics({
    display: primaryDisplay,
    overlay: primaryDisplay.workArea,
    overlayVisible: true,
    overlayClickThrough: true,
    dock: { x: 100, y: 49, width: 640, height: 72 },
    panel: null,
    panelVisible: false,
  });

  assert.match(line, /overlay=.*clickThrough=true/);
  assert.match(line, /dock=x100,y49,640x72/);
  assert.match(line, /display=id1/);
});

test("buildWindowState exposes diagnostics string", () => {
  const state = buildWindowState("overlay=full clickThrough=true", true, true, "passive", false);
  assert.equal(state.overlayVisible, true);
  assert.equal(state.overlayClickThrough, true);
  assert.equal(state.overlayMode, "passive");
  assert.equal(state.diagnostics, "overlay=full clickThrough=true");
});
