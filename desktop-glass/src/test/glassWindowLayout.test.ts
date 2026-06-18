import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatGlassWindowDiagnostics,
  buildWindowState,
} from "../main/glassWindowDiagnostics.ts";
import { parseOverlayMode } from "../shared/glassWindowTypes.ts";
import {
  commandBarLayoutFromDisplay,
  commandBarLayoutForStack,
  clampCommandBarWindowBounds,
  COMMAND_BAR_COMPOSER_ROW_PX,
  commandBarMaxBottomY,
  commandBarWindowChromePaddingPx,
  glassLayoutContentBottomY,
  MACOS_DOCK_DEFAULT_CLEARANCE_PX,
  COMMAND_BAR_BOTTOM_MARGIN,
  COMMAND_BAR_HEIGHT,
  COMMAND_BAR_ROOT_BOTTOM_PADDING_PX,
  COMMAND_BAR_STACK_TOP_PADDING_PX,
  commandBarWindowHeightForStack,
  computeCommandBarOverlayClearancePx,
  commandBarOverlayClearanceFallbackPx,
  dockLayoutFromDisplay,
  listenNotesPadLayoutFromDisplay,
  overlayLayoutFromDisplay,
  overlayNotificationBottomPx,
  OVERLAY_CHAT_STACK_FALLBACK_PX,
  panelLayoutFromDisplay,
  type DisplayLayoutContext,
  clampDockSize,
} from "../shared/glassLayoutMath.ts";
import { resolveChromeWindowBounds } from "../shared/chromeLayout.ts";

const macBookBuiltIn: DisplayLayoutContext = {
  id: 1,
  scaleFactor: 2,
  bounds: { x: 0, y: 0, width: 1440, height: 900 },
  workArea: { x: 0, y: 30, width: 1440, height: 870 },
};

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

test("overlay layout uses workArea so the frame stays visible", () => {
  const overlay = overlayLayoutFromDisplay(primaryDisplay);
  const panel = panelLayoutFromDisplay(primaryDisplay);
  const dock = dockLayoutFromDisplay(primaryDisplay, "compact_dock");

  assert.equal(overlay.x, primaryDisplay.workArea.x);
  assert.equal(overlay.y, primaryDisplay.workArea.y);
  assert.equal(overlay.width, primaryDisplay.workArea.width);
  assert.equal(overlay.height, glassLayoutContentBottomY(primaryDisplay) - primaryDisplay.workArea.y);
  assert.ok(panel.y >= primaryDisplay.workArea.y);
  assert.ok(dock.y >= primaryDisplay.workArea.y);
});

test("overlay trims built-in MacBook workArea that sits under the dock", () => {
  const overlay = overlayLayoutFromDisplay(macBookBuiltIn);
  assert.equal(overlay.height, macBookBuiltIn.workArea.height - MACOS_DOCK_DEFAULT_CLEARANCE_PX);
});

test("command bar is bottom-centered inside the work area", () => {
  const bar = commandBarLayoutFromDisplay(primaryDisplay);
  // capped width
  assert.equal(bar.width, 760);
  // centered horizontally
  const center = bar.x + bar.width / 2;
  assert.equal(center, primaryDisplay.workArea.x + primaryDisplay.workArea.width / 2);
  // sits above the macOS dock, not under it
  assert.equal(bar.y + bar.height, commandBarMaxBottomY(primaryDisplay));
  assert.ok(bar.y > primaryDisplay.workArea.y);
});

test("overlay clearance uses full command bar window position, not stack height alone", () => {
  const externalDisplay: DisplayLayoutContext = {
    id: 2,
    scaleFactor: 2,
    bounds: { x: 1440, y: 0, width: 1920, height: 1080 },
    workArea: { x: 1440, y: 30, width: 1920, height: 1050 },
  };
  const bar = {
    x: 2020,
    y: commandBarMaxBottomY(externalDisplay) - COMMAND_BAR_HEIGHT,
    width: 760,
    height: COMMAND_BAR_HEIGHT,
  };
  const stackHeightPx = 61;
  const workBottom = glassLayoutContentBottomY(externalDisplay);

  const clearance = computeCommandBarOverlayClearancePx({
    workAreaBottomY: workBottom,
    commandBarY: bar.y,
    commandBarHeight: bar.height,
    stackHeightPx,
  });

  // Stack-only math (61 + 14 gap) would overlap; full window math clears the tall bar window.
  assert.equal(clearance, 113);
  assert.ok(clearance > stackHeightPx + 14);
  assert.equal(
    overlayNotificationBottomPx({ commandBarOverlayClearancePx: clearance }),
    clearance + 14,
  );
});

test("default bottom-anchored bar clearance equals margin + padding + stack", () => {
  const bar = commandBarLayoutFromDisplay(primaryDisplay);
  const stackHeightPx = 61;
  const workBottom = glassLayoutContentBottomY(primaryDisplay);
  const clearance = computeCommandBarOverlayClearancePx({
    workAreaBottomY: workBottom,
    commandBarY: bar.y,
    commandBarHeight: bar.height,
    stackHeightPx,
  });
  assert.equal(
    clearance,
    COMMAND_BAR_BOTTOM_MARGIN + COMMAND_BAR_ROOT_BOTTOM_PADDING_PX + stackHeightPx,
  );
  assert.equal(commandBarOverlayClearanceFallbackPx(stackHeightPx), clearance);
});

test("command bar default window height matches compact stack, not legacy 280px shell", () => {
  const bar = commandBarLayoutFromDisplay(primaryDisplay);
  assert.equal(
    bar.height,
    commandBarWindowHeightForStack(OVERLAY_CHAT_STACK_FALLBACK_PX),
  );
  assert.ok(bar.height < COMMAND_BAR_HEIGHT);
});

test("command bar window grows with tall accessory stacks (Lens panel)", () => {
  assert.equal(
    commandBarWindowHeightForStack(61),
    COMMAND_BAR_COMPOSER_ROW_PX + commandBarWindowChromePaddingPx(),
  );
  const tallStack = 340;
  assert.equal(commandBarWindowHeightForStack(tallStack), tallStack + commandBarWindowChromePaddingPx());
});

test("clampCommandBarWindowBounds pulls a stale low origin back into the work area", () => {
  const clamped = clampCommandBarWindowBounds(
    { x: 400, y: 836, width: 760, height: 73 },
    macBookBuiltIn,
  );
  assert.equal(clamped.y + clamped.height, commandBarMaxBottomY(macBookBuiltIn));
});

test("commandBarLayoutForStack bottom-anchors tall stacks with custom X", () => {
  const ctx: DisplayLayoutContext = {
    id: 2,
    scaleFactor: 2,
    bounds: { x: 1440, y: 0, width: 1920, height: 1080 },
    workArea: { x: 1440, y: 30, width: 1920, height: 987 },
  };
  const layout = commandBarLayoutForStack(ctx, 180, 1988);
  assert.equal(layout.x, 1988);
  assert.equal(layout.y + layout.height, commandBarMaxBottomY(ctx));
});

test("locked command bar keeps a user-placed Y instead of bottom re-anchoring", () => {
  const auto = commandBarLayoutFromDisplay(primaryDisplay);
  const customOrigin = { x: auto.x, y: auto.y - 72 };
  const locked = clampCommandBarWindowBounds(
    resolveChromeWindowBounds(auto, customOrigin, primaryDisplay.workArea),
    primaryDisplay,
  );
  assert.equal(locked.y, customOrigin.y);
  assert.notEqual(locked.y, auto.y);
});

test("terminal-open dock clamp allows tall dropdown stacks up to the height cap", () => {
  const requested = clampDockSize(primaryDisplay, 900, 520, { terminalOpen: true });
  assert.equal(requested.height, 520);
  const closed = clampDockSize(primaryDisplay, 900, 520, { terminalOpen: false });
  assert.ok(closed.height < requested.height);
  assert.ok(requested.height >= 500);
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
    commandBar: { x: 900, y: 1450, width: 760, height: COMMAND_BAR_HEIGHT },
  });

  assert.match(line, /overlay=.*clickThrough=true/);
  assert.match(line, /dock=x100,y49,640x72/);
  assert.match(line, /commandBar=x900,y1450,760x280 clickThrough=false/);
  assert.match(line, /display=id1/);
});

test("listen notes panel docks on the left with a compact width", () => {
  const panel = listenNotesPadLayoutFromDisplay(primaryDisplay);
  const defaultPanel = panelLayoutFromDisplay(primaryDisplay);
  assert.ok(panel.x < defaultPanel.x);
  assert.ok(panel.width <= 420);
  assert.ok(panel.width >= 320);
  assert.ok(panel.height > 400);
});

test("buildWindowState exposes diagnostics + command bar visibility", () => {
  const state = buildWindowState("overlay=full clickThrough=true", true, true, "passive", false, true);
  assert.equal(state.overlayVisible, true);
  assert.equal(state.overlayClickThrough, true);
  assert.equal(state.overlayMode, "passive");
  assert.equal(state.commandBarVisible, true);
  assert.equal(state.diagnostics, "overlay=full clickThrough=true");
});
