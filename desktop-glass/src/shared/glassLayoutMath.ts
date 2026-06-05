/**
 * Pure layout math for IIVO Glass (no Electron — testable in Node).
 */

import {
  DEFAULT_GLASS_LAYOUT_PRESET,
  type GlassLayoutPreset,
} from "./glassLayoutTypes.ts";

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayLayoutContext {
  bounds: LayoutRect;
  workArea: LayoutRect;
  scaleFactor: number;
  id: number;
}

export interface OverlayLayout extends LayoutRect {}

export interface PanelLayout extends LayoutRect {}

export interface CommandBarLayout extends LayoutRect {}

export interface DockLayout extends LayoutRect {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

export interface DockSizeLimits {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

const EDGE_MARGIN = 24;
const TOP_INSET = 40;
const PANEL_WIDTH_MIN = 720;
/** Wide setup dashboard — use most of the display without covering the whole screen. */
const PANEL_WIDTH_MAX = 1800;
const PANEL_WIDTH_RATIO = 0.78;
const DOCK_MIN_WIDTH = 280;
/** Narrow vertical pill — width hugs short action labels. */
export const DOCK_MIN_WIDTH_VERTICAL = 128;
const DOCK_MIN_HEIGHT = 44;
const DOCK_DEFAULT_HEIGHT = 84;
const DOCK_MAX_HEIGHT_RATIO = 0.25;
/** Tall enough for vertical dock (long pill + overflow menu). */
const DOCK_MAX_HEIGHT_CAP = 960;
const DOCK_DEFAULT_MAX_WIDTH = 720;
const COMMAND_BAR_MAX_WIDTH = 760;
const COMMAND_BAR_HEIGHT = 96;
const COMMAND_BAR_BOTTOM_MARGIN = 28;
const COMMAND_BAR_SIDE_MARGIN = 48;
const DOCK_ABOVE_COMMAND_BAR_GAP = 0;

/** Bottom gap between workArea and display bounds (dock reserve, etc.). */
export function displayBottomReserve(ctx: DisplayLayoutContext): number {
  const boundsBottom = ctx.bounds.y + ctx.bounds.height;
  const workBottom = ctx.workArea.y + ctx.workArea.height;
  return Math.max(0, boundsBottom - workBottom);
}

/** Visible desktop region — align overlay to workArea so the frame stays on-screen. */
export function overlayLayoutFromDisplay(ctx: DisplayLayoutContext): OverlayLayout {
  return {
    x: ctx.workArea.x,
    y: ctx.workArea.y,
    width: ctx.workArea.width,
    height: ctx.workArea.height,
  };
}

export function panelLayoutFromDisplay(
  ctx: DisplayLayoutContext,
  _preset: GlassLayoutPreset = DEFAULT_GLASS_LAYOUT_PRESET,
): PanelLayout {
  const width = Math.min(
    PANEL_WIDTH_MAX,
    Math.max(PANEL_WIDTH_MIN, Math.round(ctx.workArea.width * PANEL_WIDTH_RATIO)),
  );
  const height = Math.max(PANEL_WIDTH_MIN, ctx.workArea.height - TOP_INSET - EDGE_MARGIN);

  return {
    x: ctx.workArea.x + ctx.workArea.width - width - EDGE_MARGIN,
    y: ctx.workArea.y + TOP_INSET,
    width,
    height,
  };
}

/** Bottom-centered command bar inside the visible work area. */
export function commandBarLayoutFromDisplay(ctx: DisplayLayoutContext): CommandBarLayout {
  const width = Math.min(
    COMMAND_BAR_MAX_WIDTH,
    Math.max(320, ctx.workArea.width - COMMAND_BAR_SIDE_MARGIN),
  );
  const height = COMMAND_BAR_HEIGHT;
  const x = ctx.workArea.x + Math.round((ctx.workArea.width - width) / 2);
  const y = ctx.workArea.y + ctx.workArea.height - height - COMMAND_BAR_BOTTOM_MARGIN;

  return { x, y, width, height };
}

export type DockClampOptions = {
  minWidth?: number;
  /** Vertical dock stacks every action — allow the full height cap, not the horizontal 25% limit. */
  vertical?: boolean;
};

function dockMaxHeight(ctx: DisplayLayoutContext, vertical?: boolean): number {
  if (vertical) {
    return DOCK_MAX_HEIGHT_CAP;
  }
  return Math.min(
    DOCK_MAX_HEIGHT_CAP,
    Math.max(DOCK_MIN_HEIGHT, Math.round(ctx.workArea.height * DOCK_MAX_HEIGHT_RATIO)),
  );
}

export function dockSizeLimits(ctx: DisplayLayoutContext, options?: DockClampOptions): DockSizeLimits {
  return {
    minWidth: DOCK_MIN_WIDTH,
    minHeight: DOCK_MIN_HEIGHT,
    maxWidth: Math.max(DOCK_MIN_WIDTH, ctx.workArea.width - EDGE_MARGIN * 2),
    maxHeight: dockMaxHeight(ctx, options?.vertical),
  };
}

export function clampDockSize(
  ctx: DisplayLayoutContext,
  width: number,
  height: number,
  options?: DockClampOptions,
): { width: number; height: number } {
  const limits = dockSizeLimits(ctx, options);
  const minWidth = options?.minWidth ?? limits.minWidth;
  return {
    width: Math.max(minWidth, Math.min(Math.round(width), limits.maxWidth)),
    height: Math.max(limits.minHeight, Math.min(Math.round(height), limits.maxHeight)),
  };
}

function dockAnchorX(ctx: DisplayLayoutContext, preset: GlassLayoutPreset, width: number): number {
  switch (preset) {
    case "floating_dock":
    case "focus_mode":
      return ctx.workArea.x + Math.round((ctx.workArea.width - width) / 2);
    case "compact_dock":
    case "full_glass_overlay":
    case "side_panel":
    default: {
      const bar = commandBarLayoutFromDisplay(ctx);
      return bar.x;
    }
  }
}

function dockAnchorY(
  ctx: DisplayLayoutContext,
  preset: GlassLayoutPreset,
  height: number,
): number {
  switch (preset) {
    case "floating_dock":
    case "focus_mode":
      return ctx.workArea.y + ctx.workArea.height - height - EDGE_MARGIN;
    case "compact_dock":
    case "full_glass_overlay":
    case "side_panel":
    default: {
      const bar = commandBarLayoutFromDisplay(ctx);
      return bar.y - height - DOCK_ABOVE_COMMAND_BAR_GAP;
    }
  }
}

function dockDefaultWidth(ctx: DisplayLayoutContext, limits: DockSizeLimits): number {
  return Math.min(DOCK_DEFAULT_MAX_WIDTH, limits.maxWidth);
}

export function dockLayoutFromDisplay(
  ctx: DisplayLayoutContext,
  preset: GlassLayoutPreset = DEFAULT_GLASS_LAYOUT_PRESET,
  contentWidth?: number,
  contentHeight?: number,
  clampOptions?: DockClampOptions,
): DockLayout {
  const limits = dockSizeLimits(ctx);
  const width = contentWidth
    ? clampDockSize(ctx, contentWidth, contentHeight ?? DOCK_DEFAULT_HEIGHT, clampOptions).width
    : dockDefaultWidth(ctx, limits);
  const height = contentHeight
    ? clampDockSize(ctx, width, contentHeight, clampOptions).height
    : Math.min(DOCK_DEFAULT_HEIGHT, limits.maxHeight);

  const x = dockAnchorX(ctx, preset, width);
  const y = dockAnchorY(ctx, preset, height);

  return { x, y, width, height, ...limits };
}

export function repositionDockInWorkArea(
  ctx: DisplayLayoutContext,
  preset: GlassLayoutPreset,
  current: LayoutRect,
  nextWidth: number,
  nextHeight: number,
): LayoutRect {
  const { width, height } = clampDockSize(ctx, nextWidth, nextHeight);
  const layout = dockLayoutFromDisplay(ctx, preset, width, height);

  const wasDefaultAligned =
    Math.abs(current.y - layout.y) < 48 && Math.abs(current.x - layout.x) < 48;

  let x = wasDefaultAligned ? layout.x : current.x;
  let y = wasDefaultAligned ? layout.y : current.y;

  x = Math.max(ctx.workArea.x + EDGE_MARGIN, Math.min(x, ctx.workArea.x + ctx.workArea.width - width - EDGE_MARGIN));
  y = Math.max(ctx.workArea.y + EDGE_MARGIN, Math.min(y, ctx.workArea.y + ctx.workArea.height - height - EDGE_MARGIN));

  return { x: Math.round(x), y: Math.round(y), width, height };
}
