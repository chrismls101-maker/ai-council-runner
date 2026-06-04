import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampDockSize,
  dockLayoutFromDisplay,
  overlayLayoutFromDisplay,
  panelLayoutFromDisplay,
  type DisplayLayoutContext,
} from "../shared/glassLayoutMath.ts";
import { parseLayoutPreset } from "../shared/glassLayoutTypes.ts";

const macBook13: DisplayLayoutContext = {
  id: 1,
  scaleFactor: 2,
  bounds: { x: 0, y: 0, width: 2560, height: 1600 },
  workArea: { x: 0, y: 25, width: 2560, height: 1575 },
};

const externalMonitor: DisplayLayoutContext = {
  id: 2,
  scaleFactor: 1,
  bounds: { x: 2560, y: 0, width: 1920, height: 1080 },
  workArea: { x: 2560, y: 0, width: 1920, height: 1055 },
};

test("overlay uses selected display bounds", () => {
  const layout = overlayLayoutFromDisplay(macBook13);
  assert.equal(layout.x, macBook13.bounds.x);
  assert.equal(layout.y, macBook13.bounds.y);
  assert.equal(layout.width, macBook13.bounds.width);
  assert.equal(layout.height, macBook13.bounds.height);
});

test("panel uses workArea and responsive width", () => {
  const layout = panelLayoutFromDisplay(macBook13);
  assert.equal(layout.width, 480);
  assert.equal(layout.height, macBook13.workArea.height - 40 - 24);
  assert.ok(layout.x + layout.width <= macBook13.workArea.x + macBook13.workArea.width);
});

test("panel width scales down on narrow display", () => {
  const narrow: DisplayLayoutContext = {
    ...externalMonitor,
    workArea: { x: 0, y: 0, width: 900, height: 700 },
  };
  const layout = panelLayoutFromDisplay(narrow);
  assert.equal(layout.width, 320);
});

test("dock compact preset anchors to top workArea", () => {
  const layout = dockLayoutFromDisplay(macBook13, "compact_dock");
  assert.equal(layout.y, macBook13.workArea.y + 24);
  assert.ok(layout.width <= 720);
  assert.ok(layout.x >= macBook13.workArea.x);
});

test("dock floating preset anchors to bottom workArea", () => {
  const layout = dockLayoutFromDisplay(macBook13, "floating_dock", 400, 72);
  assert.equal(layout.y, macBook13.workArea.y + macBook13.workArea.height - 72 - 24);
});

test("clamp dock size respects workArea margins", () => {
  const clamped = clampDockSize(macBook13, 9000, 9000);
  assert.equal(clamped.width, macBook13.workArea.width - 48);
  assert.ok(clamped.height <= 220);
});

test("parse layout preset falls back safely", () => {
  assert.equal(parseLayoutPreset("floating_dock"), "floating_dock");
  assert.equal(parseLayoutPreset("invalid"), "compact_dock");
});
