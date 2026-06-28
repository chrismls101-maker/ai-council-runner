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
  /** macOS NSScreen.visibleFrame — tracks Dock autohide when Electron workArea is stale. */
  workAreaSource?: "electron" | "macos-visible-frame";
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
const PANEL_WIDTH_MIN = 840;
/** Wide setup dashboard — use most of the display without covering the whole screen. */
const PANEL_WIDTH_MAX = 1800;
/** Gap between dock edge and panel left edge. */
export const PANEL_DOCK_GAP_PX = 0;
/** Gap between panel bottom and builder strip top (0 = flush on strip top edge). */
export const PANEL_ABOVE_BUILDER_STRIP_GAP_PX = 0;
const LISTEN_NOTES_PANEL_WIDTH_MIN = 320;
const LISTEN_NOTES_PANEL_WIDTH_MAX = 420;
const LISTEN_NOTES_PANEL_WIDTH_RATIO = 0.26;
const DOCK_MIN_WIDTH = 280;
/** Narrow vertical pill — width hugs short action labels. */
export const DOCK_MIN_WIDTH_VERTICAL = 128;
/** Slim right icon rail — fixed column width. */
export const DOCK_RAIL_MIN_WIDTH = 52;
/** Extra width in left-rail dock OS window for side tooltips (transparent; sync useDockResize + glass.css). */
export const DOCK_RAIL_TOOLTIP_SIDE_RESERVE_PX = 200;
/** Bleed added around measured dock content in resizeDock (sync useDockResize). */
export const DOCK_WINDOW_SIZE_PADDING_PX = 12;
/** Reserve space above the dock pill for top-placed tooltips (sync useDockResize). */
export const DOCK_TOOLTIP_TOP_RESERVE_PX = 44;
/** Small vertical bleed inside the left-rail dock window (sync useDockResize). */
export const DOCK_RAIL_VERTICAL_PADDING_PX = 12;
/** Aliases used by useDockResize (keep in sync with glass.css dock-rail padding). */
export const DOCK_SIZE_PADDING = DOCK_WINDOW_SIZE_PADDING_PX;
export const DOCK_TOOLTIP_TOP_RESERVE = DOCK_TOOLTIP_TOP_RESERVE_PX;
export const DOCK_RAIL_VERTICAL_PADDING = DOCK_RAIL_VERTICAL_PADDING_PX;
export const DOCK_RAIL_TOOLTIP_SIDE_RESERVE = DOCK_RAIL_TOOLTIP_SIDE_RESERVE_PX;
export const DOCK_TOOLTIP_SIDE_RESERVE = DOCK_RAIL_TOOLTIP_SIDE_RESERVE_PX;
const DOCK_MIN_HEIGHT = 44;
const DOCK_DEFAULT_HEIGHT = 84;
const DOCK_MAX_HEIGHT_RATIO = 0.25;
/** Tall enough for vertical dock (long pill + overflow menu). */
const DOCK_MAX_HEIGHT_CAP = 960;
const DOCK_DEFAULT_MAX_WIDTH = 720;
const COMMAND_BAR_MAX_WIDTH = 760;
/** Max bar window height when Lens / voice accessories expand the stack. */
export const COMMAND_BAR_HEIGHT = 280;
/** Gap above the macOS dock — default command bar sits a little higher on first install. */
export const COMMAND_BAR_BOTTOM_MARGIN = 48;
/** Legacy fallback when dock overlays windows without shrinking workArea (rare on modern macOS). */
export const MACOS_DOCK_DEFAULT_CLEARANCE_PX = 72;
/** Small edge margin when workArea already reaches the screen bottom (dock autohide / hidden). */
export const MACOS_DOCK_HIDDEN_CLEARANCE_PX = 12;
/** Composer row block height (min-height 58 + shell padding 19). */
export const COMMAND_BAR_COMPOSER_ROW_PX = 77;
/** Room below the stack for composer box-shadow (excluded from ResizeObserver height). */
export const COMMAND_BAR_SHADOW_BOTTOM_PX = 18;
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

/** Builder strip tab bar — flush above the frame bottom border (L-brackets stay on top via z-index). */
export const BUILDER_STRIP_HEIGHT_PX = 40;
/** Frame inset from overlay bottom (matches --overlay-frame-bottom). */
export const BUILDER_STRIP_FRAME_INSET_PX = 7;
/** Hairline gap above the frame box bottom edge (frame uses 1px border on that edge). */
export const BUILDER_STRIP_ABOVE_FRAME_BOTTOM_GAP_PX = 1;
/** Gap between strip top and command bar window bottom. */
export const BUILDER_STRIP_ABOVE_COMMAND_BAR_GAP_PX = 8;

/** Viewport distance from bottom to the builder strip top edge (strip band only). */
export function builderStripTopFromBottomPx(): number {
  return (
    BUILDER_STRIP_FRAME_INSET_PX +
    BUILDER_STRIP_ABOVE_FRAME_BOTTOM_GAP_PX +
    BUILDER_STRIP_HEIGHT_PX
  );
}

/** Extra bottom reserve so the command bar clears the builder strip band. */
export function builderStripLayoutReservePx(): number {
  return builderStripTopFromBottomPx() + BUILDER_STRIP_ABOVE_COMMAND_BAR_GAP_PX;
}

/** Gap between Glass IDE shell bottom and builder strip top (cost footer sits inside shell). */
export const GLASS_IDE_ABOVE_STRIP_GAP_PX = 0;

/** Fixed height of per-run cost footer sitting above the builder strip. */
export const GLASS_IDE_COST_FOOTER_PX = 28;

/** Bottom inset for Glass IDE shell — flush on builder strip (cost footer is inside the shell). */
export function glassIdeBottomReservePx(): number {
  return builderStripTopFromBottomPx() + GLASS_IDE_ABOVE_STRIP_GAP_PX;
}

/** Fallback stack height when the command bar has not reported measured height yet. */
export const OVERLAY_CHAT_STACK_FALLBACK_PX = COMMAND_BAR_COMPOSER_ROW_PX;

/** Padding inside the command bar window around the measured stack. */
export function commandBarWindowChromePaddingPx(): number {
  return (
    COMMAND_BAR_ROOT_BOTTOM_PADDING_PX +
    COMMAND_BAR_STACK_TOP_PADDING_PX +
    COMMAND_BAR_SHADOW_BOTTOM_PX
  );
}

/** Compact bar window — composer row only (no 280px invisible drag dead zone). */
export const COMMAND_BAR_MIN_WINDOW_HEIGHT =
  COMMAND_BAR_COMPOSER_ROW_PX + commandBarWindowChromePaddingPx();

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

/** Dock / system strip clearance — follow macOS workArea when the dock reserves space. */
export function macDockClearancePx(ctx: DisplayLayoutContext): number {
  const dockStrip = displayBottomReserve(ctx);
  if (dockStrip >= 24) {
    return dockStrip;
  }
  // Autohide: workArea expands to the screen bottom when the dock is hidden — no fake 72px strip.
  return MACOS_DOCK_HIDDEN_CLEARANCE_PX;
}

/** Bottom of the interactive Glass frame (overlay) — sits above the dock strip. */
export function glassLayoutContentBottomY(ctx: DisplayLayoutContext): number {
  const workBottom = ctx.workArea.y + ctx.workArea.height;
  if (ctx.workAreaSource === "macos-visible-frame") {
    return workBottom;
  }
  const boundsBottom = ctx.bounds.y + ctx.bounds.height;
  return boundsBottom - macDockClearancePx(ctx);
}

/** Union of layout rectangles (virtual desktop span). */
export function boundsUnion(rects: readonly LayoutRect[]): LayoutRect {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

/** Visible desktop region — align overlay above the macOS dock, not under it. */
export function overlayLayoutFromDisplay(ctx: DisplayLayoutContext): OverlayLayout {
  const contentBottom = glassLayoutContentBottomY(ctx);
  return {
    x: ctx.workArea.x,
    y: ctx.workArea.y,
    width: ctx.workArea.width,
    height: Math.max(0, contentBottom - ctx.workArea.y),
  };
}

/**
 * Multi-display Glass — one overlay spanning every connected monitor.
 * Chrome (dock, command bar) lays out on the cursor display separately.
 */
export function overlayLayoutSpanningDisplays(contexts: readonly DisplayLayoutContext[]): OverlayLayout {
  if (contexts.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  if (contexts.length === 1) {
    return overlayLayoutFromDisplay(contexts[0]!);
  }
  const union = boundsUnion(contexts.map((ctx) => ctx.workArea));
  const maxContentBottom = Math.max(...contexts.map((ctx) => glassLayoutContentBottomY(ctx)));
  return {
    x: union.x,
    y: union.y,
    width: union.width,
    height: Math.max(0, maxContentBottom - union.y),
  };
}

/** Bottom Y for Glass chrome (command bar window bottom edge) above the macOS dock. */
export function commandBarMaxBottomY(
  ctx: DisplayLayoutContext,
  bottomReservePx = 0,
): number {
  const overlay = overlayLayoutFromDisplay(ctx);
  return overlay.y + overlay.height - COMMAND_BAR_BOTTOM_MARGIN - Math.max(0, bottomReservePx);
}

export type PanelLayoutOptions = {
  /** Live dock window bounds when available. */
  dockBounds?: LayoutRect | null;
  dockPlacement?: "left-rail" | "top";
};

/** Panel bottom Y — flush above the in-overlay builder strip band. */
export function panelContentBottomY(ctx: DisplayLayoutContext): number {
  return (
    glassLayoutContentBottomY(ctx) -
    builderStripTopFromBottomPx() -
    PANEL_ABOVE_BUILDER_STRIP_GAP_PX
  );
}

/** Settings window — full work-area width, same vertical band as Glass Dashboard. */
export function settingsLayoutFromDisplay(ctx: DisplayLayoutContext): PanelLayout {
  const overlay = overlayLayoutFromDisplay(ctx);
  const bottomY = panelContentBottomY(ctx);
  return {
    x: overlay.x,
    y: overlay.y,
    width: overlay.width,
    height: Math.max(480, bottomY - overlay.y),
  };
}

/** Visible dock chrome width for panel attach — excludes transparent tooltip reserve. */
export function dockContentWidthForPanelAttach(
  dockWindowWidth: number,
  placement: "left-rail" | "top" = "left-rail",
): number {
  if (placement !== "left-rail") return dockWindowWidth;
  return Math.max(
    DOCK_RAIL_MIN_WIDTH,
    dockWindowWidth - DOCK_RAIL_TOOLTIP_SIDE_RESERVE_PX,
  );
}

/**
 * Default: left-rail dock → panel opens to the right of the rail at full available width.
 */
export function panelLayoutFromDisplay(
  ctx: DisplayLayoutContext,
  _preset: GlassLayoutPreset = DEFAULT_GLASS_LAYOUT_PRESET,
  options?: PanelLayoutOptions,
): PanelLayout {
  const placement = options?.dockPlacement ?? "left-rail";
  const panelBottomY = panelContentBottomY(ctx);
  const rightEdge = ctx.workArea.x + ctx.workArea.width - EDGE_MARGIN;

  if (placement === "top") {
    const dock =
      options?.dockBounds ??
      dockLayoutFromDisplay(ctx, _preset);
    const x = Math.max(ctx.workArea.x + EDGE_MARGIN, dock.x);
    const y = dock.y + dock.height + PANEL_DOCK_GAP_PX;
    const availableWidth = rightEdge - x;
    const width = Math.min(
      PANEL_WIDTH_MAX,
      Math.max(Math.min(PANEL_WIDTH_MIN, availableWidth), availableWidth),
    );
    const height = Math.max(480, panelBottomY - y);
    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    };
  }

  const defaultRail = dockLeftRailLayoutFromDisplay(ctx);
  const dockX = options?.dockBounds?.x ?? defaultRail.x;
  const dockW = options?.dockBounds?.x != null && options?.dockBounds?.width != null
    ? dockContentWidthForPanelAttach(options.dockBounds.width, placement)
    : defaultRail.width;
  const overlay = overlayLayoutFromDisplay(ctx);
  const dockRight = dockX + dockW;
  const panelRight = overlay.x + overlay.width;
  const x = dockRight + PANEL_DOCK_GAP_PX;
  const y = overlay.y;
  const width = Math.max(480, panelRight - x);
  const height = Math.max(480, panelBottomY - y);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
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

/** Bar window height that fits a measured accessory stack without clipping the shell or shadow. */
export function commandBarWindowHeightForStack(stackHeightPx: number): number {
  const stack = Math.max(COMMAND_BAR_COMPOSER_ROW_PX, Math.round(stackHeightPx));
  return stack + commandBarWindowChromePaddingPx();
}

/** Keep the command bar window fully inside the work area (bottom-anchored safe inset). */
export function clampCommandBarWindowBounds(
  bounds: LayoutRect,
  ctx: DisplayLayoutContext,
  bottomReservePx = 0,
): LayoutRect {
  const maxBottom = commandBarMaxBottomY(ctx, bottomReservePx);
  const minY = ctx.workArea.y + EDGE_MARGIN;
  let y = bounds.y;
  if (y + bounds.height > maxBottom) {
    y = maxBottom - bounds.height;
  }
  if (y < minY) {
    y = minY;
  }
  const minX = ctx.workArea.x + EDGE_MARGIN;
  const maxX = ctx.workArea.x + ctx.workArea.width - bounds.width - EDGE_MARGIN;
  const x = Math.round(Math.max(minX, Math.min(bounds.x, maxX)));
  return {
    x,
    y: Math.round(y),
    width: bounds.width,
    height: bounds.height,
  };
}

/** Bottom-centered command bar for a measured stack height; optional custom X when locked. */
export function commandBarLayoutForStack(
  ctx: DisplayLayoutContext,
  stackHeightPx: number,
  customX?: number | null,
  bottomReservePx = 0,
): CommandBarLayout {
  const width = Math.min(
    COMMAND_BAR_MAX_WIDTH,
    Math.max(320, ctx.workArea.width - COMMAND_BAR_SIDE_MARGIN),
  );
  const height = commandBarWindowHeightForStack(stackHeightPx);
  const defaultX = ctx.workArea.x + Math.round((ctx.workArea.width - width) / 2);
  const x =
    customX != null
      ? Math.round(
          Math.max(
            ctx.workArea.x + EDGE_MARGIN,
            Math.min(customX, ctx.workArea.x + ctx.workArea.width - width - EDGE_MARGIN),
          ),
        )
      : defaultX;
  const y = commandBarMaxBottomY(ctx, bottomReservePx) - height;
  return clampCommandBarWindowBounds({ x, y, width, height }, ctx, bottomReservePx);
}

/** Bottom-centered command bar inside the visible work area. */
export function commandBarLayoutFromDisplay(ctx: DisplayLayoutContext): CommandBarLayout {
  return commandBarLayoutForStack(ctx, OVERLAY_CHAT_STACK_FALLBACK_PX);
}

export type DockClampOptions = {
  minWidth?: number;
  /** Vertical dock stacks every action — allow the full height cap, not the horizontal 25% limit. */
  vertical?: boolean;
  /** Built-in terminal dropdown needs more vertical room than the compact dock pill. */
  terminalOpen?: boolean;
};

function dockMaxHeight(ctx: DisplayLayoutContext, vertical?: boolean, terminalOpen?: boolean): number {
  if (vertical || terminalOpen) {
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
    maxHeight: dockMaxHeight(ctx, options?.vertical, options?.terminalOpen),
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
  return dockXAlignedToCommandBar(ctx, width);
}

/** Horizontal X for a dock window so its center matches the command bar center. */
export function dockXAlignedToCommandBar(
  ctx: DisplayLayoutContext,
  dockWidth: number,
  options?: {
    commandBarStackHeightPx?: number;
    commandBarCustomX?: number | null;
    commandBarCenterX?: number;
  },
): number {
  const centerX =
    options?.commandBarCenterX ??
    (() => {
      const bar = commandBarLayoutForStack(
        ctx,
        options?.commandBarStackHeightPx ?? OVERLAY_CHAT_STACK_FALLBACK_PX,
        options?.commandBarCustomX,
      );
      return bar.x + bar.width / 2;
    })();
  return Math.round(
    Math.max(
      ctx.workArea.x + EDGE_MARGIN,
      Math.min(
        centerX - dockWidth / 2,
        ctx.workArea.x + ctx.workArea.width - dockWidth - EDGE_MARGIN,
      ),
    ),
  );
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

/** Left edge X for the icon rail (flush to work area with margin). */
export function dockLeftRailX(ctx: DisplayLayoutContext, _width?: number): number {
  return Math.round(ctx.workArea.x + EDGE_MARGIN);
}

/** Vertically centered Y for the icon rail. */
export function dockRailY(ctx: DisplayLayoutContext, height: number): number {
  const y = ctx.workArea.y + (ctx.workArea.height - height) / 2;
  return Math.round(Math.max(ctx.workArea.y + EDGE_MARGIN, y));
}

export function dockLeftRailLayoutFromDisplay(
  ctx: DisplayLayoutContext,
  contentWidth?: number,
  contentHeight?: number,
  clampOptions?: DockClampOptions,
): DockLayout {
  const railOptions: DockClampOptions = {
    ...clampOptions,
    vertical: true,
    minWidth: DOCK_RAIL_MIN_WIDTH,
  };
  const limits = dockSizeLimits(ctx, railOptions);
  const width = contentWidth
    ? clampDockSize(
        ctx,
        contentWidth,
        contentHeight ?? DOCK_DEFAULT_HEIGHT,
        railOptions,
      ).width
    : DOCK_RAIL_MIN_WIDTH;
  const height = contentHeight
    ? clampDockSize(ctx, width, contentHeight, railOptions).height
    : Math.min(DOCK_DEFAULT_HEIGHT, limits.maxHeight);

  return {
    x: dockLeftRailX(ctx, width),
    y: dockRailY(ctx, height),
    width,
    height,
    ...limits,
  };
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
  clampOptions?: DockClampOptions,
): LayoutRect {
  const { width, height } = clampDockSize(ctx, nextWidth, nextHeight, clampOptions);
  const layout = dockLayoutFromDisplay(ctx, preset, width, height);

  const wasDefaultAligned =
    Math.abs(current.y - layout.y) < 48 && Math.abs(current.x - layout.x) < 48;

  let x = wasDefaultAligned ? layout.x : current.x;
  let y = wasDefaultAligned ? layout.y : current.y;

  x = Math.max(ctx.workArea.x + EDGE_MARGIN, Math.min(x, ctx.workArea.x + ctx.workArea.width - width - EDGE_MARGIN));
  y = Math.max(ctx.workArea.y + EDGE_MARGIN, Math.min(y, ctx.workArea.y + ctx.workArea.height - height - EDGE_MARGIN));

  return { x: Math.round(x), y: Math.round(y), width, height };
}
