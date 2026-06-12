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
const LISTEN_NOTES_PANEL_WIDTH_MIN = 320;
const LISTEN_NOTES_PANEL_WIDTH_MAX = 420;
const LISTEN_NOTES_PANEL_WIDTH_RATIO = 0.26;
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
/** Max bar window height when Lens / voice accessories expand the stack. */
export const COMMAND_BAR_HEIGHT = 280;
export const COMMAND_BAR_BOTTOM_MARGIN = 28;
/** `.command-root` padding-bottom — stack sits above this inset inside the bar window. */
export const COMMAND_BAR_ROOT_BOTTOM_PADDING_PX = 4;
/** Extra headroom above the measured stack inside the bar window (Lens panel, etc.). */
export const COMMAND_BAR_STACK_TOP_PADDING_PX = 8;
const COMMAND_BAR_SIDE_MARGIN = 48;
const DOCK_ABOVE_COMMAND_BAR_GAP = 0;
/** Top margin between dock and screen/work-area top edge. */
export const DOCK_TOP_MARGIN = 12;

/** Gap between measured command bar stack and overlay chat cards. */
export const OVERLAY_CHAT_STACK_GAP_PX = 14;

/** Fallback stack height when the command bar has not reported measured height yet. */
export const OVERLAY_CHAT_STACK_FALLBACK_PX = 58;

/** Compact bar window — composer row only (no 280px invisible drag dead zone). */
export const COMMAND_BAR_MIN_WINDOW_HEIGHT =
  OVERLAY_CHAT_STACK_FALLBACK_PX +
  COMMAND_BAR_ROOT_BOTTOM_PADDING_PX +
  COMMAND_BAR_STACK_TOP_PADDING_PX;

/**
 * Distance from the overlay work-area bottom to the top of the command bar stack
 * (accounts for bar window position, tall bar window, and measured stack height).
 */
export function computeCommandBarOverlayClearancePx(input: {
  workAreaBottomY: number;
  commandBarY: number;
  commandBarHeight: number;
  stackHeightPx: number;
}): number {
  const stack = Math.max(0, Math.round(input.stackHeightPx));
  const stackTopY =
    input.commandBarY +
    input.commandBarHeight -
    COMMAND_BAR_ROOT_BOTTOM_PADDING_PX -
    stack;
  return Math.max(0, Math.round(input.workAreaBottomY - stackTopY));
}

/** Fallback clearance when bar bounds are unavailable (default bottom-anchored layout). */
export function commandBarOverlayClearanceFallbackPx(stackHeightPx?: number): number {
  const stack =
    stackHeightPx && stackHeightPx > 0
      ? stackHeightPx
      : OVERLAY_CHAT_STACK_FALLBACK_PX;
  return COMMAND_BAR_BOTTOM_MARGIN + COMMAND_BAR_ROOT_BOTTOM_PADDING_PX + stack;
}

/** @deprecated Use overlayNotificationBottomPx — kept for tests migrating off frame+stack-only math. */
export const OVERLAY_CHAT_CLEARANCE_FALLBACK_PX = commandBarOverlayClearanceFallbackPx();

/** Bottom offset (px from overlay work-area bottom) for chat response cards. */
export function overlayNotificationBottomPx(input: {
  commandBarOverlayClearancePx?: number;
  commandBarStackHeightPx?: number;
}): number {
  const clearance =
    input.commandBarOverlayClearancePx && input.commandBarOverlayClearancePx > 0
      ? input.commandBarOverlayClearancePx
      : commandBarOverlayClearanceFallbackPx(input.commandBarStackHeightPx);
  return clearance + OVERLAY_CHAT_STACK_GAP_PX;
}

/** @deprecated Prefer overlayNotificationBottomPx with measured clearance from main process. */
export function overlayChatNotificationBottomPx(
  _frameBottomInsetPx: number,
  commandBarStackHeightPx?: number,
): number {
  return overlayNotificationBottomPx({ commandBarStackHeightPx });
}

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

/** Compact left-side floating notepad during Listen mode — keeps video visible on the right. */
export function listenNotesPadLayoutFromDisplay(ctx: DisplayLayoutContext): PanelLayout {
  const width = Math.min(
    LISTEN_NOTES_PANEL_WIDTH_MAX,
    Math.max(
      LISTEN_NOTES_PANEL_WIDTH_MIN,
      Math.round(ctx.workArea.width * LISTEN_NOTES_PANEL_WIDTH_RATIO),
    ),
  );
  const commandReserve =
    commandBarWindowHeightForStack(OVERLAY_CHAT_STACK_FALLBACK_PX) +
    COMMAND_BAR_BOTTOM_MARGIN +
    EDGE_MARGIN;
  const height = Math.max(
    LISTEN_NOTES_PANEL_WIDTH_MIN,
    ctx.workArea.height - TOP_INSET - commandReserve,
  );

  return {
    x: ctx.workArea.x + EDGE_MARGIN,
    y: ctx.workArea.y + TOP_INSET,
    width,
    height,
  };
}

/** @deprecated Use listenNotesPadLayoutFromDisplay */
export const listenNotesPanelLayoutFromDisplay = listenNotesPadLayoutFromDisplay;

/** Bar window height that fits a measured accessory stack without clipping the top. */
export function commandBarWindowHeightForStack(stackHeightPx: number): number {
  const stack = Math.max(0, Math.round(stackHeightPx));
  if (stack <= 0) return COMMAND_BAR_MIN_WINDOW_HEIGHT;
  const fitted = stack + COMMAND_BAR_ROOT_BOTTOM_PADDING_PX + COMMAND_BAR_STACK_TOP_PADDING_PX;
  return Math.max(COMMAND_BAR_MIN_WINDOW_HEIGHT, fitted);
}

/** Bottom-centered command bar inside the visible work area. */
export function commandBarLayoutFromDisplay(ctx: DisplayLayoutContext): CommandBarLayout {
  const width = Math.min(
    COMMAND_BAR_MAX_WIDTH,
    Math.max(320, ctx.workArea.width - COMMAND_BAR_SIDE_MARGIN),
  );
  const height = commandBarWindowHeightForStack(OVERLAY_CHAT_STACK_FALLBACK_PX);
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

function dockAnchorX(ctx: DisplayLayoutContext, _preset: GlassLayoutPreset, width: number): number {
  return ctx.workArea.x + Math.round((ctx.workArea.width - width) / 2);
}

/** Vertical center of the command bar window (dock aligns to this Y). */
export function commandBarVerticalCenterY(ctx: DisplayLayoutContext): number {
  const bar = commandBarLayoutFromDisplay(ctx);
  return bar.y + bar.height / 2;
}

function dockAnchorY(
  ctx: DisplayLayoutContext,
  _preset: GlassLayoutPreset,
  _height: number,
): number {
  // Dock sits at the top of the work area with a small margin.
  return ctx.workArea.y + DOCK_TOP_MARGIN;
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
