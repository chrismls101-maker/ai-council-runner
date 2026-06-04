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
const PANEL_WIDTH_MIN = 320;
const PANEL_WIDTH_MAX = 480;
const PANEL_WIDTH_RATIO = 0.32;
const DOCK_MIN_WIDTH = 280;
const DOCK_MIN_HEIGHT = 44;
const DOCK_DEFAULT_HEIGHT = 84;
const DOCK_MAX_HEIGHT_RATIO = 0.25;
const DOCK_MAX_HEIGHT_CAP = 220;
const DOCK_DEFAULT_MAX_WIDTH = 720;

/** Visible desktop region — avoids macOS menu bar/dock clipping the bottom border. */
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

export function dockSizeLimits(ctx: DisplayLayoutContext): DockSizeLimits {
  return {
    minWidth: DOCK_MIN_WIDTH,
    minHeight: DOCK_MIN_HEIGHT,
    maxWidth: Math.max(DOCK_MIN_WIDTH, ctx.workArea.width - EDGE_MARGIN * 2),
    maxHeight: Math.min(
      DOCK_MAX_HEIGHT_CAP,
      Math.max(DOCK_MIN_HEIGHT, Math.round(ctx.workArea.height * DOCK_MAX_HEIGHT_RATIO)),
    ),
  };
}

export function clampDockSize(
  ctx: DisplayLayoutContext,
  width: number,
  height: number,
): { width: number; height: number } {
  const limits = dockSizeLimits(ctx);
  return {
    width: Math.max(limits.minWidth, Math.min(Math.round(width), limits.maxWidth)),
    height: Math.max(limits.minHeight, Math.min(Math.round(height), limits.maxHeight)),
  };
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
    default:
      return ctx.workArea.y + EDGE_MARGIN;
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
): DockLayout {
  const limits = dockSizeLimits(ctx);
  const width = contentWidth
    ? clampDockSize(ctx, contentWidth, contentHeight ?? DOCK_DEFAULT_HEIGHT).width
    : dockDefaultWidth(ctx, limits);
  const height = contentHeight
    ? clampDockSize(ctx, width, contentHeight).height
    : Math.min(DOCK_DEFAULT_HEIGHT, limits.maxHeight);

  const x = ctx.workArea.x + Math.round((ctx.workArea.width - width) / 2);
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

  const prevCenterX = current.x + current.width / 2;
  const workCenterX = ctx.workArea.x + ctx.workArea.width / 2;
  const wasCentered = Math.abs(prevCenterX - workCenterX) < 48;

  let x = wasCentered ? layout.x : current.x;
  let y = current.y;

  x = Math.max(ctx.workArea.x + EDGE_MARGIN, Math.min(x, ctx.workArea.x + ctx.workArea.width - width - EDGE_MARGIN));
  y = Math.max(ctx.workArea.y + EDGE_MARGIN, Math.min(y, ctx.workArea.y + ctx.workArea.height - height - EDGE_MARGIN));

  return { x: Math.round(x), y: Math.round(y), width, height };
}
