import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatGlassWindowDiagnostics,
  buildWindowState,
} from "../main/glassWindowDiagnostics.ts";
import { parseOverlayMode } from "../shared/glassWindowTypes.ts";
import {
  commandBarLayoutFromDisplay,
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

const smallDisplay: DisplayLayoutContext = {
  id: 2,
  scaleFactor: 1,
  bounds: { x: 0, y: 0, width: 1280, height: 800 },
  workArea: { x: 0, y: 24, width: 1280, height: 752 },
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

test("command bar is bottom-centered inside the work area", () => {
  const bar = commandBarLayoutFromDisplay(primaryDisplay);
  // capped width
  assert.equal(bar.width, 760);
  // centered horizontally
  const center = bar.x + bar.width / 2;
  assert.equal(center, primaryDisplay.workArea.x + primaryDisplay.workArea.width / 2);
  // sits near the bottom of the work area, above the edge
  assert.ok(bar.y + bar.height < primaryDisplay.workArea.y + primaryDisplay.workArea.height);
  assert.ok(bar.y > primaryDisplay.workArea.y);
});

test("command bar shrinks to fit a small display", () => {
  const bar = commandBarLayoutFromDisplay(smallDisplay);
  assert.ok(bar.width <= smallDisplay.workArea.width - 48);
  assert.ok(bar.x >= smallDisplay.workArea.x);
});

test("formatGlassWindowDiagnostics includes click-through flag and command bar", () => {
  const line = formatGlassWindowDiagnostics({
    display: primaryDisplay,
    overlay: primaryDisplay.workArea,
    overlayVisible: true,
    overlayClickThrough: true,
    dock: { x: 100, y: 49, width: 640, height: 72 },
    panel: null,
    panelVisible: false,
    commandBar: { x: 900, y: 1450, width: 760, height: 96 },
  });

  assert.match(line, /overlay=.*clickThrough=true/);
  assert.match(line, /dock=x100,y49,640x72/);
  assert.match(line, /commandBar=x900,y1450,760x96 clickThrough=false/);
  assert.match(line, /display=id1/);
});

test("buildWindowState exposes diagnostics + command bar visibility", () => {
  const state = buildWindowState("overlay=full clickThrough=true", true, true, "passive", false, true);
  assert.equal(state.overlayVisible, true);
  assert.equal(state.overlayClickThrough, true);
  assert.equal(state.overlayMode, "passive");
  assert.equal(state.commandBarVisible, true);
  assert.equal(state.diagnostics, "overlay=full clickThrough=true");
});
