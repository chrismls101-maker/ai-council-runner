import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampDockSize,
  dockSizeLimits,
  commandBarLayoutFromDisplay,
  commandBarLayoutForStack,
  DOCK_TOP_MARGIN,
  dockLayoutFromDisplay,
  dockXAlignedToCommandBar,
  glassLayoutContentBottomY,
  OVERLAY_CHAT_STACK_FALLBACK_PX,
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

test("overlay uses selected display workArea", () => {
  const layout = overlayLayoutFromDisplay(macBook13);
  assert.equal(layout.x, macBook13.workArea.x);
  assert.equal(layout.y, macBook13.workArea.y);
  assert.equal(layout.width, macBook13.workArea.width);
  assert.equal(layout.height, glassLayoutContentBottomY(macBook13) - macBook13.workArea.y);
});

test("panel uses workArea and responsive width", () => {
  const layout = panelLayoutFromDisplay(macBook13);
  assert.equal(layout.width, 1800);
  assert.equal(layout.height, macBook13.workArea.height - 40 - 24);
  assert.ok(layout.x + layout.width <= macBook13.workArea.x + macBook13.workArea.width);
});

test("panel uses most of external display width", () => {
  const layout = panelLayoutFromDisplay(externalMonitor);
  assert.equal(layout.width, 1498);
});

test("panel width scales down on narrow display", () => {
  const narrow: DisplayLayoutContext = {
    ...externalMonitor,
    workArea: { x: 0, y: 0, width: 900, height: 700 },
  };
  const layout = panelLayoutFromDisplay(narrow);
  assert.equal(layout.width, 720);
});

test("dock compact preset is horizontally centered and top-anchored", () => {
  const bar = commandBarLayoutFromDisplay(macBook13);
  const layout = dockLayoutFromDisplay(macBook13, "compact_dock");
  const dockCenterX = layout.x + layout.width / 2;
  const barCenterX = bar.x + bar.width / 2;
  // Dock and command bar share the same horizontal center.
  assert.equal(dockCenterX, barCenterX);
  // Dock sits at the top of the work area.
  assert.equal(layout.y, macBook13.workArea.y + DOCK_TOP_MARGIN);
  assert.ok(layout.width <= 720);
});

test("dock X aligns to command bar when bar uses a custom X", () => {
  const bar = commandBarLayoutForStack(macBook13, OVERLAY_CHAT_STACK_FALLBACK_PX, 900);
  const dockW = 320;
  const dockX = dockXAlignedToCommandBar(macBook13, dockW, {
    commandBarCustomX: 900,
  });
  assert.equal(dockX + dockW / 2, bar.x + bar.width / 2);
});

test("dock floating preset is horizontally centered and top-anchored", () => {
  const layout = dockLayoutFromDisplay(macBook13, "floating_dock", 400, 72);
  // Dock sits at top of work area regardless of content height.
  assert.equal(layout.y, macBook13.workArea.y + DOCK_TOP_MARGIN);
  const center = layout.x + layout.width / 2;
  assert.equal(center, macBook13.workArea.x + macBook13.workArea.width / 2);
});

test("clamp dock size respects workArea margins", () => {
  const limits = dockSizeLimits(macBook13);
  const clamped = clampDockSize(macBook13, 9000, 9000);
  assert.equal(clamped.width, macBook13.workArea.width - 48);
  assert.ok(clamped.height <= limits.maxHeight);
});

test("vertical dock clamp allows full stacked-action height cap", () => {
  const limits = dockSizeLimits(macBook13, { vertical: true });
  const clamped = clampDockSize(macBook13, 140, 680, { vertical: true });
  assert.equal(clamped.height, 680);
  assert.ok(limits.maxHeight >= 720);
});

test("parse layout preset falls back safely", () => {
  assert.equal(parseLayoutPreset("floating_dock"), "floating_dock");
  assert.equal(parseLayoutPreset("invalid"), "compact_dock");
});
