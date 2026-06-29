/**
 * IIVO Glass — three-layer window architecture:
 * 1. Full-screen overlay (workArea + bottom safe inset, click-through by default)
 * 2. Compact dock (workArea, clickable)
 * 3. Optional side panel (workArea, clickable when open)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app, globalShortcut, Menu, screen, shell, type IpcMainEvent, type WebContents } from "electron";
import { GLASS_BOOT_SOUND_ENABLED } from "../shared/bootSound.ts";
import type { GlassConfig } from "../shared/config.ts";
import {
  attachGlassWindowFocusDebug,
  debugSetIgnoreMouseEvents,
  logGlassClickDebug,
} from "./glassClickDebug.ts";
import type { OverlayMode } from "../shared/glassWindowTypes.ts";
import {
  GLASS_HOTKEY_PRESETS,
  hotkeyRegistrationMessage,
  type ChromeOrigin,
  type DockPlacement,
  type GlassDisplayTarget,
  type GlassHotkeyPreset,
  type GlassUserSettings,
} from "../shared/glassSettings.ts";
import { resolveChromeWindowBounds } from "../shared/chromeLayout.ts";
import {
  buildDisplayDiagnosticsSummary,
  listConnectedDisplaySnapshots,
  sanitizeDisplayTarget,
} from "./displayRegistry.ts";
import { GlassLayoutManager, getPrimaryDisplayContext } from "./glassLayoutManager.ts";
import {
  readMacVisibleWorkArea,
  readMacVisibleWorkAreaSync,
  workAreaLayoutKey,
} from "./macosVisibleFrame.ts";
import {
  clampCommandBarWindowBounds,
  commandBarLayoutForStack,
  commandBarMaxBottomY,
  commandBarWindowHeightForStack,
  COMMAND_BAR_ROOT_BOTTOM_PADDING_PX,
  dockXAlignedToCommandBar,
  dockLeftRailX,
  dockRailY,
  DOCK_RAIL_MIN_WIDTH,
  glassLayoutContentBottomY,
  OVERLAY_CHAT_STACK_FALLBACK_PX,
  overlayLayoutFromDisplay,
  type PanelLayout,
} from "../shared/glassLayoutMath.ts";
import {
  isFollowMouseTrackingActive,
  startFollowMouseTracking,
  stopFollowMouseTracking,
} from "./followMouseDisplay.ts";
import {
  buildWindowState,
  formatGlassWindowDiagnostics,
  logGlassWindowDiagnostics,
  rectFromWindow,
} from "./glassWindowDiagnostics.ts";
import {
  GLASS_TERMINAL_DEFAULT_HEIGHT,
  GLASS_TERMINAL_DEFAULT_WIDTH,
  GLASS_TERMINAL_REVEAL_MS,
  idealTerminalPanelWidth,
} from "../renderer/dock/glassTerminalLayout.ts";
import {
  GLASS_TERMINAL_WINDOW_PADDING_PX,
  terminalWindowBoundsBelowDock,
  terminalWindowBoundsBesideDock,
} from "./glassTerminalWindow.ts";
import { IPC } from "../shared/ipc.ts";

const isDev = !!process.env.ELECTRON_RENDERER_URL;
const mainDir = dirname(fileURLToPath(import.meta.url));
const preloadPath = join(mainDir, "../preload/index.mjs");

type RendererPage =
  | "index.html"
  | "panel.html"
  | "overlay.html"
  | "command.html"
  | "splash.html"
  | "splash-background.html"
  | "notes.html"
  | "terminal.html";

export interface GlassWindows {
  dock: BrowserWindow;
  /** Created on first open — not loaded at dock-only idle. */
  panel: BrowserWindow | null;
  overlay: BrowserWindow;
  commandBar: BrowserWindow;
  /** Created on first Listen notes use. */
  notesPad: BrowserWindow | null;
  /** Created on first terminal open. */
  terminal: BrowserWindow | null;
}

let windows: GlassWindows | null = null;
let splashWindow: BrowserWindow | null = null;
let layoutManager: GlassLayoutManager | null = null;
let overlayVisible = true;
/** Keep overlay window up for center-screen notices even when the user hid the overlay. */
let overlayNoticePinned = false;
/** Keep overlay window visible for live-translate captions when overlay chrome is hidden. */
let overlayPinnedForTranslate = false;
/** Keep overlay window visible for computer-operator ambient edge glow (safety UX). */
let overlayPinnedForComputerOperator = false;
let overlayClickThrough = true;
let commandBarClickThrough = false;
let overlayMode: OverlayMode = "passive";
let commandBarVisible = true;
let notesPadVisible = false;
let chromeLayoutLocked = true;
let dockPlacement: DockPlacement = "left-rail";
let dockCustomOrigin: ChromeOrigin | null = null;
let commandBarCustomOrigin: ChromeOrigin | null = null;
let lastCommandBarStackHeightPx: number | undefined;
let chromeLayoutPersist: ((partial: Partial<GlassUserSettings>) => void) | null = null;
let chromeMovePersistTimer: ReturnType<typeof setTimeout> | null = null;
/** Skip per-window loadRenderer during createWindows — staggered vite loads run after. */
let skipInitialRendererLoad = false;
/** When true, dock/overlay/command bar stay hidden until {@link finishSplash} completes. */
let glassBootPending = false;
let pendingRelayoutAfterBoot: { resetDock?: boolean } | null = null;
/** When true, onboarding blocks dock and command bar until calibration completes. */
let onboardingPending = false;
/** When true, activation fullscreen gate hides all Glass chrome. */
let activationPending = false;
/** Renderer requested full/partial interactive overlay during onboarding (language picker, inputs). */
let onboardingOverlayForceInteractive = false;
let onGlassBootSequenceComplete: (() => void) | null = null;
const ONBOARDING_ESCAPE_ACCEL = "Escape";
let onboardingEmergencyHandler: (() => void) | null = null;

let onCommandBarLayoutChanged: (() => void) | null = null;
let onGlassDisplayLayoutChanged: (() => void) | null = null;
let macVisibleFrameWatchTimer: ReturnType<typeof setInterval> | null = null;
let lastMacVisibleWorkAreaKey = "";
let macVisibleFrameRefreshInFlight = false;
/** False until command bar React mounts — setBounds before mount aborts ES module load on macOS. */
let commandBarRendererReady = false;
let deferredCommandBarLayout: { resetPosition: boolean; forceLayout: boolean } | null = null;
let commandBarMountFallbackTimer: ReturnType<typeof setTimeout> | null = null;

function commandBarRendererBusy(): boolean {
  if (!windows?.commandBar || windows.commandBar.isDestroyed()) return false;
  return !commandBarRendererReady;
}

function clearCommandBarMountFallbackTimer(): void {
  if (commandBarMountFallbackTimer) {
    clearTimeout(commandBarMountFallbackTimer);
    commandBarMountFallbackTimer = null;
  }
}

function scheduleCommandBarMountFallback(): void {
  clearCommandBarMountFallbackTimer();
  commandBarMountFallbackTimer = setTimeout(() => {
    commandBarMountFallbackTimer = null;
    if (commandBarRendererReady) return;
    console.warn(
      "[IIVO Glass] command bar React mount timeout — applying layout anyway (check renderer errors)",
    );
    markCommandBarRendererReady();
  }, 15_000);
}

export function notifyCommandBarRendererMounted(event: IpcMainEvent): void {
  if (!windows?.commandBar || windows.commandBar.isDestroyed()) return;
  if (event.sender.id !== windows.commandBar.webContents.id) return;
  markCommandBarRendererReady();
}

function markCommandBarRendererReady(): void {
  if (commandBarRendererReady) return;
  clearCommandBarMountFallbackTimer();
  commandBarRendererReady = true;
  const pending = deferredCommandBarLayout;
  deferredCommandBarLayout = null;
  if (pending && windows?.commandBar && !windows.commandBar.isDestroyed()) {
    applyCommandBarLayout(pending.resetPosition, pending.forceLayout);
  }
  if (shouldShowCommandBarWindow()) {
    ensureCommandBarWindowVisible();
  }
  if (windows) stackGlassWindows(windows);
}

/** Main process hook — recompute overlay chat clearance when the bar moves or relayouts. */
export function setCommandBarLayoutChangedHandler(handler: (() => void) | null): void {
  onCommandBarLayoutChanged = handler;
}

/** Main process hook — refresh Aletheia display awareness when layout/display changes. */
export function setGlassDisplayLayoutChangedHandler(handler: (() => void) | null): void {
  onGlassDisplayLayoutChanged = handler;
}

function notifyCommandBarLayoutChanged(): void {
  onCommandBarLayoutChanged?.();
}

function notifyGlassDisplayLayoutChanged(): void {
  onGlassDisplayLayoutChanged?.();
}

function prepareVitePanelBeforeLoad(win: BrowserWindow, surface: "chrome" | "overlay"): void {
  if (!isDev || process.platform !== "darwin" || win.isDestroyed()) return;
  win.showInactive();
  if (surface === "chrome") {
    ensureChromeWindowInteractive(win, "vite-preload");
  }
}

function waitForWindowLoad(win: BrowserWindow, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve) => {
    if (win.isDestroyed()) {
      resolve();
      return;
    }
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    if (!win.webContents.isLoading()) {
      finish();
      return;
    }
    const timer = setTimeout(finish, timeoutMs);
    const done = (): void => {
      clearTimeout(timer);
      finish();
    };
    win.webContents.once("did-finish-load", done);
    win.webContents.once("did-fail-load", done);
  });
}

async function waitForViteDevServer(maxMs = 120_000): Promise<void> {
  const base = process.env.ELECTRON_RENDERER_URL?.replace(/\/$/, "");
  if (!base) return;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(base);
      if (res.ok) return;
    } catch {
      /* server still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  console.warn(`[IIVO Glass] vite dev server not ready after ${maxMs}ms (${base})`);
}

async function runStaggeredViteRendererLoads(w: GlassWindows): Promise<void> {
  await waitForViteDevServer();
  prepareVitePanelBeforeLoad(w.dock, "chrome");
  loadRenderer(w.dock, "index.html");
  await waitForWindowLoad(w.dock);

  prepareVitePanelBeforeLoad(w.commandBar, "chrome");
  loadRenderer(w.commandBar, "command.html");
  await waitForWindowLoad(w.commandBar);

  prepareVitePanelBeforeLoad(w.overlay, "overlay");
  loadRenderer(w.overlay, "overlay.html");
  await waitForWindowLoad(w.overlay);
}

function loadRenderer(
  win: BrowserWindow,
  htmlFile: RendererPage,
  query?: Record<string, string>,
): void {
  if (skipInitialRendererLoad) return;

  const qs =
    query && Object.keys(query).length > 0
      ? `?${new URLSearchParams(query).toString()}`
      : "";
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    prepareVitePanelBeforeLoad(
      win,
      htmlFile === "overlay.html" ? "overlay" : "chrome",
    );
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${htmlFile}${qs}`);
  } else {
    void win.loadFile(join(mainDir, `../renderer/${htmlFile}`), {
      query: query ?? {},
    });
  }
}

/** Overlay above desktop apps; interactive windows stack above overlay via relativeLevel. */
const OVERLAY_ALWAYS_ON_TOP_LEVEL = "screen-saver" as const;
/** Command bar uses a higher macOS window level so it paints above the full-screen overlay panel. */
const COMMAND_BAR_ALWAYS_ON_TOP_LEVEL =
  process.platform === "darwin" ? ("pop-up-menu" as const) : OVERLAY_ALWAYS_ON_TOP_LEVEL;
const OVERLAY_ALWAYS_ON_TOP_RELATIVE = 0;
const OVERLAY_RAISED_FOR_NOTIFICATIONS_RELATIVE = 3;
/** Chrome uses panel type on macOS — keep well above overlay relative levels. */
const DOCK_ALWAYS_ON_TOP_RELATIVE = 16;
const TERMINAL_ALWAYS_ON_TOP_RELATIVE = 17;
/** Must stay above OVERLAY_BUILDER_MODAL_RELATIVE so the bar is never covered by the full-screen overlay. */
const COMMAND_BAR_ALWAYS_ON_TOP_RELATIVE = 20;
const COMMAND_BAR_TOP_RELATIVE = 22;
/** Builder strip panels + Aletheia menu — overlay above dock, below command bar. */
const OVERLAY_BUILDER_MODAL_RELATIVE = 13;
const NOTES_PAD_ALWAYS_ON_TOP_RELATIVE = 24;
const PANEL_ALWAYS_ON_TOP_RELATIVE = 26;

let overlayRaisedForNotifications = false;
let overlayPointerOverNotification = false;
let overlayPointerOverDebriefPanel = false;
/** When true, dock + command bar stay hidden while Glass IDE / Coder workspace is active. */
let ideChromeSuppressed = false;
let overlayPointerOverBuilderStrip = false;
/** Glass IDE session open — keep overlay OS-interactive for splits, tree, composer. */
let overlayIdeActive = false;
let overlayPointerOverIde = false;
let overlayPointerOverExitControl = false;
let overlayResearchExplorerActive = false;
let overlayCodeAnalystExplorerActive = false;
let overlayWritingStudioActive = false;
let overlayGlassStorageProjectsActive = false;
let overlayGlassSpacesActive = false;
let overlayGlassDashboardActive = false;
let overlayAletheiaDashboardActive = false;
/** Increment when a full-screen workspace opens; focus overlay only on epoch change. */
let overlayWorkspaceFocusEpoch = 0;
let overlayWorkspaceFocusAppliedEpoch = -1;
let builderStripPanelOpen = false;
let builderStripPanelOccludesDock = false;
let builderStripPanelOccludesCommandBar = false;
let builderStripActivePanel: string | undefined;
let aletheiaStripMenuOpen = false;
let commandPaletteOpen = false;
let powersMenuOpen = false;
let responsePanelOpen = false;
let copilotOverlayCardOpen = false;

function overlayPaletteModalActive(): boolean {
  return commandPaletteOpen || powersMenuOpen || responsePanelOpen || copilotOverlayCardOpen;
}
let builderStripBottomReservePx = 0;
let terminalWindowVisible = false;
let lastTerminalPanelWidth = GLASS_TERMINAL_DEFAULT_WIDTH;
let lastTerminalPanelHeight = GLASS_TERMINAL_DEFAULT_HEIGHT;
let terminalDismissTimer: ReturnType<typeof setTimeout> | null = null;
let terminalPanelSizedByRenderer = false;

function refreshTerminalPanelWidthFromDisplay(): void {
  const workW = layoutManager?.getDisplay().workArea.width;
  if (typeof workW === "number" && workW > 0) {
    lastTerminalPanelWidth = idealTerminalPanelWidth(workW);
  }
}

function resetOverlayClickThroughState(overlay: BrowserWindow): void {
  if (overlay.isDestroyed()) return;
  const win = overlay as BrowserWindow & { _resetPassthrough?: () => void };
  if (typeof win._resetPassthrough === "function") {
    win._resetPassthrough();
  } else {
    configureOverlayClickThrough(overlay);
  }
}

/** Renderer reports pointer entered/left the notification card (scroll / click target). */
export function setOverlayPointerOverNotification(over: boolean): void {
  overlayPointerOverNotification = over;
  if (!windows?.overlay || windows.overlay.isDestroyed()) return;
  if (!overlayRaisedForNotifications || !over) {
    if (overlayIdeInteractive()) {
      debugSetIgnoreMouseEvents(windows.overlay, "overlay", false);
      return;
    }
    resetOverlayClickThroughState(windows.overlay);
    return;
  }
  debugSetIgnoreMouseEvents(windows.overlay, "overlay", false);
  raiseChromeAboveOverlay(windows);
}

function overlayFullscreenWorkspaceActive(): boolean {
  return overlayResearchExplorerActive
    || overlayCodeAnalystExplorerActive
    || overlayWritingStudioActive
    || overlayGlassStorageProjectsActive
    || overlayGlassSpacesActive
    || overlayGlassDashboardActive
    || overlayAletheiaDashboardActive;
}

/** Native macOS dialogs must not sit behind the always-on-top overlay. */
export async function withOverlayNativeDialog<T>(run: () => Promise<T>): Promise<T> {
  const overlay = windows?.overlay;
  const suspendTop =
    overlay && !overlay.isDestroyed() && overlayFullscreenWorkspaceActive();
  if (suspendTop) {
    overlay.setAlwaysOnTop(false);
  }
  try {
    return await run();
  } finally {
    if (suspendTop && overlay && !overlay.isDestroyed()) {
      overlay.setAlwaysOnTop(
        true,
        OVERLAY_ALWAYS_ON_TOP_LEVEL,
        OVERLAY_ALWAYS_ON_TOP_RELATIVE,
      );
      if (overlayFullscreenWorkspaceActive()) {
        applyFullscreenWorkspaceOverlayMode();
      }
    }
  }
}

function overlayIdeInteractive(): boolean {
  return overlayIdeActive || overlayPointerOverIde || overlayFullscreenWorkspaceActive();
}

function markOverlayWorkspaceOpened(): void {
  overlayWorkspaceFocusEpoch += 1;
}

function transitionOverlayWorkspaceFlag(current: boolean, next: boolean): boolean {
  if (next && !current) markOverlayWorkspaceOpened();
  return next;
}

function overlayWorkspaceWantsKeyboardCapture(): boolean {
  return (
    overlayResearchExplorerActive
    || overlayCodeAnalystExplorerActive
    || overlayWritingStudioActive
    || overlayGlassSpacesActive
    || overlayGlassDashboardActive
    || overlayAletheiaDashboardActive
  );
}

/** Glass Storage Projects — clicks inside, but no global keyboard steal until user focuses in. */
function applyGlassStorageProjectsPassiveOverlayMode(): void {
  if (!windows?.overlay || windows.overlay.isDestroyed()) return;
  if (!overlayGlassStorageProjectsActive) return;
  const overlay = windows.overlay;
  const cancelPassthrough = (overlay as BrowserWindow & { _cancelPassthroughDebounced?: () => void })
    ._cancelPassthroughDebounced;
  cancelPassthrough?.();
  debugSetIgnoreMouseEvents(overlay, "overlay", false);
  overlay.setFocusable(false);
  overlay.showInactive();
}

/** Full-screen workspace (Research / Code Analyst) — OS must accept clicks + keyboard. */
function applyFullscreenWorkspaceOverlayMode(): void {
  if (!windows?.overlay || windows.overlay.isDestroyed()) return;
  if (!overlayFullscreenWorkspaceActive()) return;
  if (overlayGlassStorageProjectsActive && !overlayWorkspaceWantsKeyboardCapture()) {
    applyGlassStorageProjectsPassiveOverlayMode();
    return;
  }
  const overlay = windows.overlay;
  const cancelPassthrough = (overlay as BrowserWindow & { _cancelPassthroughDebounced?: () => void })
    ._cancelPassthroughDebounced;
  cancelPassthrough?.();
  debugSetIgnoreMouseEvents(overlay, "overlay", false);
  overlay.setFocusable(true);
  overlay.show();
  // Focus only when a workspace first opens — not on every state push / relayout.
  if (overlayWorkspaceFocusAppliedEpoch !== overlayWorkspaceFocusEpoch) {
    overlayWorkspaceFocusAppliedEpoch = overlayWorkspaceFocusEpoch;
    overlay.focus();
    overlay.webContents.focus();
  }
}

function focusGlassStorageProjectsOverlay(): void {
  if (!windows?.overlay || windows.overlay.isDestroyed()) return;
  if (!overlayGlassStorageProjectsActive) return;
  const overlay = windows.overlay;
  const cancelPassthrough = (overlay as BrowserWindow & { _cancelPassthroughDebounced?: () => void })
    ._cancelPassthroughDebounced;
  cancelPassthrough?.();
  debugSetIgnoreMouseEvents(overlay, "overlay", false);
  overlay.setFocusable(true);
  overlay.show();
  overlay.focus();
  overlay.webContents.focus();
}

function applyActiveFullscreenWorkspaceOverlayMode(): void {
  if (overlayGlassStorageProjectsActive && !overlayWorkspaceWantsKeyboardCapture()) {
    applyGlassStorageProjectsPassiveOverlayMode();
    return;
  }
  applyFullscreenWorkspaceOverlayMode();
}

function applyBuilderStripOverlayInteractivity(): void {
  if (!windows?.overlay || windows.overlay.isDestroyed()) return;
  const overlay = windows.overlay;
  if (overlayFullscreenWorkspaceActive()) {
    applyActiveFullscreenWorkspaceOverlayMode();
    return;
  }
  if (overlayPaletteModalActive()) {
    debugSetIgnoreMouseEvents(overlay, "overlay", false);
    return;
  }
  const interactive =
    overlayIdeInteractive()
    || overlayPointerOverBuilderStrip
    || overlayPointerOverExitControl
    || builderStripPanelOpen
    || aletheiaStripMenuOpen
    || overlayPointerOverDebriefPanel;
  if (!interactive) {
    if (!overlayPointerOverNotification) {
      resetOverlayClickThroughState(overlay);
    }
    return;
  }
  const cancelPassthrough = (overlay as BrowserWindow & { _cancelPassthroughDebounced?: () => void })
    ._cancelPassthroughDebounced;
  cancelPassthrough?.();
  debugSetIgnoreMouseEvents(overlay, "overlay", false);
}

/** Main: Glass IDE opened/closed — session-wide overlay interactivity. */
export function setOverlayIdeActive(active: boolean): void {
  overlayIdeActive = active;
  if (!active) {
    overlayPointerOverIde = false;
    if (!builderStripPanelOpen && !aletheiaStripMenuOpen) {
      overlayPointerOverBuilderStrip = false;
    }
  }
  applyBuilderStripOverlayInteractivity();
}

/** Main: Research Explorer open — full-screen overlay must receive clicks. */
export function setOverlayResearchExplorerActive(active: boolean): void {
  overlayResearchExplorerActive = transitionOverlayWorkspaceFlag(overlayResearchExplorerActive, active);
  syncFullscreenWorkspaceOverlay();
}

/** Main: Code Analyst workspace open — full-screen overlay must receive clicks. */
export function setOverlayCodeAnalystExplorerActive(active: boolean): void {
  overlayCodeAnalystExplorerActive = transitionOverlayWorkspaceFlag(
    overlayCodeAnalystExplorerActive,
    active,
  );
  syncFullscreenWorkspaceOverlay();
}

/** Main: Writing Studio open — full-screen overlay must receive clicks. */
export function setOverlayWritingStudioActive(active: boolean): void {
  overlayWritingStudioActive = transitionOverlayWorkspaceFlag(overlayWritingStudioActive, active);
  syncFullscreenWorkspaceOverlay();
}

/** Main: Glass Storage Projects open — full-screen overlay must receive clicks. */
export function setOverlayGlassStorageProjectsActive(active: boolean): void {
  overlayGlassStorageProjectsActive = transitionOverlayWorkspaceFlag(
    overlayGlassStorageProjectsActive,
    active,
  );
  syncFullscreenWorkspaceOverlay();
}

/** Main: Spaces workspace open — full-screen overlay must receive clicks. */
export function setOverlayGlassSpacesActive(active: boolean): void {
  overlayGlassSpacesActive = transitionOverlayWorkspaceFlag(overlayGlassSpacesActive, active);
  syncFullscreenWorkspaceOverlay();
}

/** Main: Glass Dashboard open — full-screen overlay above builder strip. */
export function setOverlayGlassDashboardActive(active: boolean): void {
  overlayGlassDashboardActive = transitionOverlayWorkspaceFlag(overlayGlassDashboardActive, active);
  syncFullscreenWorkspaceOverlay();
}

/** Main: Aletheia Dashboard open — full-screen overlay above builder strip. */
export function setOverlayAletheiaDashboardActive(active: boolean): void {
  overlayAletheiaDashboardActive = transitionOverlayWorkspaceFlag(
    overlayAletheiaDashboardActive,
    active,
  );
  syncFullscreenWorkspaceOverlay();
}

function syncFullscreenWorkspaceOverlay(): void {
  if (overlayFullscreenWorkspaceActive()) {
    applyActiveFullscreenWorkspaceOverlayMode();
    if (windows) raiseChromeAboveOverlay(windows);
    return;
  }
  overlayWorkspaceFocusAppliedEpoch = -1;
  if (windows?.overlay && !windows.overlay.isDestroyed()) {
    windows.overlay.setFocusable(false);
  }
  // Playwright clicks rarely hover the strip — keep it OS-interactive after workspace closes.
  overlayPointerOverBuilderStrip = true;
  applyBuilderStripOverlayInteractivity();
  if (windows) raiseChromeAboveOverlay(windows);
}

/** Renderer mounted Research Explorer — re-assert focus + click capture. */
export function notifyResearchExplorerMounted(): void {
  applyFullscreenWorkspaceOverlayMode();
}

/** Renderer mounted Code Analyst workspace — re-assert focus + click capture. */
export function notifyCodeAnalystExplorerMounted(): void {
  applyFullscreenWorkspaceOverlayMode();
}

/** Renderer mounted Writing Studio — re-assert focus + click capture. */
export function notifyWritingStudioMounted(): void {
  applyFullscreenWorkspaceOverlayMode();
}

/** Renderer mounted Glass Storage Projects — re-assert click capture (keyboard on demand). */
export function notifyGlassStorageProjectsMounted(focusKeyboard = false): void {
  if (focusKeyboard) {
    focusGlassStorageProjectsOverlay();
    return;
  }
  applyGlassStorageProjectsPassiveOverlayMode();
}

/** Renderer mounted Spaces workspace — re-assert focus + click capture. */
export function notifyGlassSpacesMounted(): void {
  applyFullscreenWorkspaceOverlayMode();
}

/** Renderer mounted Glass Dashboard — re-assert focus + click capture. */
export function notifyGlassDashboardMounted(): void {
  applyFullscreenWorkspaceOverlayMode();
}

/** Renderer mounted Aletheia Dashboard — re-assert focus + click capture. */
export function notifyAletheiaDashboardMounted(): void {
  applyFullscreenWorkspaceOverlayMode();
}

/** Renderer reports pointer over the Glass IDE shell. */
export function setOverlayPointerOverIde(over: boolean): void {
  overlayPointerOverIde = over;
  applyBuilderStripOverlayInteractivity();
}

/** Renderer reports pointer over the debrief side panel — click-through elsewhere. */
export function setOverlayPointerOverDebriefPanel(over: boolean): void {
  overlayPointerOverDebriefPanel = over;
  applyBuilderStripOverlayInteractivity();
}

/** Renderer reports pointer over the builder strip (Prompts / Keys tabs). */
export function setOverlayPointerOverBuilderStrip(over: boolean): void {
  if (overlayPointerOverBuilderStrip === over) return;
  overlayPointerOverBuilderStrip = over;
  applyBuilderStripOverlayInteractivity();
}

/** Renderer reports pointer over the Exit Glass control (top-right quit). */
export function setOverlayPointerOverExitControl(over: boolean): void {
  overlayPointerOverExitControl = over;
  applyBuilderStripOverlayInteractivity();
}

/** Renderer reports a builder strip panel is open — keep overlay interactive until closed. */
export function setBuilderStripPanelOpen(open: boolean, panel?: string): void {
  const occludesDock = open && panel !== "agents";
  const occludesCommandBar = open && panel === "spaces";
  const activePanel = open ? panel : undefined;
  if (
    builderStripPanelOpen === open
    && builderStripPanelOccludesDock === occludesDock
    && builderStripPanelOccludesCommandBar === occludesCommandBar
    && builderStripActivePanel === activePanel
  ) {
    return;
  }
  builderStripPanelOpen = open;
  builderStripPanelOccludesDock = occludesDock;
  builderStripPanelOccludesCommandBar = occludesCommandBar;
  builderStripActivePanel = activePanel;
  applyBuilderStripOverlayInteractivity();
  syncBuilderStripModalStacking();
}

/** Aletheia strip dropdown — same overlay elevation as builder panels. */
export function setAletheiaStripMenuOpen(open: boolean): void {
  if (aletheiaStripMenuOpen === open) return;
  aletheiaStripMenuOpen = open;
  applyBuilderStripOverlayInteractivity();
  syncBuilderStripModalStacking();
}

function applyOverlayPaletteModalInteractivity(): void {
  if (!windows?.overlay || windows.overlay.isDestroyed()) return;
  const overlay = windows.overlay;
  if (overlayFullscreenWorkspaceActive()) {
    applyActiveFullscreenWorkspaceOverlayMode();
    return;
  }
  const cancelPassthrough = (overlay as BrowserWindow & { _cancelPassthroughDebounced?: () => void })
    ._cancelPassthroughDebounced;
  if (!commandPaletteOpen && !powersMenuOpen && !responsePanelOpen && !copilotOverlayCardOpen) {
    overlay.setFocusable(false);
    if (
      !overlayIdeInteractive()
      && !overlayPointerOverBuilderStrip
      && !builderStripPanelOpen
      && !aletheiaStripMenuOpen
      && !overlayPointerOverNotification
      && !overlayPointerOverDebriefPanel
      && !overlayFullscreenWorkspaceActive()
    ) {
      resetOverlayClickThroughState(overlay);
    }
    overlay.showInactive();
    return;
  }
  cancelPassthrough?.();
  debugSetIgnoreMouseEvents(overlay, "overlay", false);
  if (commandPaletteOpen || powersMenuOpen) {
    overlay.setFocusable(true);
    raiseChromeAboveOverlay(windows);
    overlay.show();
    overlay.focus();
    return;
  }
  overlay.setFocusable(false);
  overlay.showInactive();
}

/** ⌘⇧G command palette — full-screen modal; overlay must capture pointer + keyboard. */
export function setCommandPaletteOpen(open: boolean): void {
  commandPaletteOpen = open;
  applyOverlayPaletteModalInteractivity();
  ensureCommandBarWindowVisible();
}

/** ⌘⇧P powers menu — same overlay modal capture as command palette. */
export function setPowersMenuOpen(open: boolean): void {
  powersMenuOpen = open;
  applyOverlayPaletteModalInteractivity();
  ensureCommandBarWindowVisible();
}

/** Glass Response Panel — keep overlay OS-interactive for scroll / copy / dismiss. */
export function setResponsePanelOpen(open: boolean): void {
  responsePanelOpen = open;
  applyOverlayPaletteModalInteractivity();
}

/** Session Copilot cards (debrief, diagnostic, offer) — keep overlay OS-interactive. */
export function setCopilotOverlayCardOpen(open: boolean): void {
  copilotOverlayCardOpen = open;
  applyOverlayPaletteModalInteractivity();
}

const CHROME_MOUSE_FORWARD = { forward: true } as const;

/**
 * Dock + command bar are bounded chrome pills (not full-screen). They must always
 * receive clicks — never use OS click-through or cursor-changed toggling.
 */
function ensureChromeWindowInteractive(win: BrowserWindow, windowName: string): void {
  if (win.isDestroyed()) return;
  debugSetIgnoreMouseEvents(win, windowName, false);
}

function shouldShowCommandBarWindow(): boolean {
  return (
    commandBarVisible
    && !ideChromeSuppressed
    && !glassBootPending
    && !onboardingPending
    && !activationPending
  );
}

/** Show the command bar OS window when chrome should be visible (idempotent). */
function ensureCommandBarWindowVisible(): void {
  if (!windows?.commandBar || windows.commandBar.isDestroyed()) return;
  if (!shouldShowCommandBarWindow()) return;
  if (commandBarRendererBusy()) return;
  applyCommandBarLayout(false, true);
  const commandBarRelative = overlayRaisedForNotifications
    ? COMMAND_BAR_TOP_RELATIVE
    : COMMAND_BAR_ALWAYS_ON_TOP_RELATIVE;
  windows.commandBar.setAlwaysOnTop(true, COMMAND_BAR_ALWAYS_ON_TOP_LEVEL, commandBarRelative);
  windows.commandBar.showInactive();
  if (!windows.commandBar.isVisible()) {
    windows.commandBar.show();
  }
  ensureChromeWindowInteractive(windows.commandBar, "commandBar");
  windows.commandBar.moveTop();
}

function scheduleCommandBarVisibilityRetries(): void {
  for (const delayMs of [50, 250, 1000]) {
    setTimeout(() => ensureCommandBarWindowVisible(), delayMs);
  }
}

function builderStripModalActive(): boolean {
  return builderStripPanelOpen || aletheiaStripMenuOpen;
}

/** Raise overlay above dock/command bar while strip panels or Aletheia menu are open. */
function syncBuilderStripModalStacking(): void {
  if (!windows?.overlay || windows.overlay.isDestroyed()) return;
  const overlay = windows.overlay;
  if (!builderStripModalActive()) {
    stackGlassWindows(windows!);
    return;
  }
  if (ideChromeSuppressed && !aletheiaStripMenuOpen) {
    stackGlassWindows(windows!);
    return;
  }
  const cancelPassthrough = (overlay as BrowserWindow & { _cancelPassthroughDebounced?: () => void })
    ._cancelPassthroughDebounced;
  cancelPassthrough?.();
  debugSetIgnoreMouseEvents(overlay, "overlay", false);
  overlay.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, OVERLAY_BUILDER_MODAL_RELATIVE);
  overlay.showInactive();
  overlay.moveTop();
  if (builderStripPanelOccludesCommandBar && windows.commandBar && !windows.commandBar.isDestroyed()) {
    windows.commandBar.hide();
  } else {
    raiseChromeAboveOverlay(windows!);
  }
  if (builderStripPanelOccludesDock && windows.dock && !windows.dock.isDestroyed()) {
    windows.dock.hide();
  }
}

/** Dock + command bar must stay above a temporarily interactive full-screen overlay. */
function raiseChromeAboveOverlay(w: GlassWindows): void {
  if (glassBootPending || onboardingPending || activationPending) return;

  if (!w.dock.isDestroyed()) {
    w.dock.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, DOCK_ALWAYS_ON_TOP_RELATIVE);
    ensureChromeWindowInteractive(w.dock, "dock");
    if (!ideChromeSuppressed) w.dock.showInactive();
  }

  if (!w.commandBar.isDestroyed() && commandBarVisible && !ideChromeSuppressed) {
    const commandBarRelative = overlayRaisedForNotifications
      ? COMMAND_BAR_TOP_RELATIVE
      : COMMAND_BAR_ALWAYS_ON_TOP_RELATIVE;
    w.commandBar.setAlwaysOnTop(true, COMMAND_BAR_ALWAYS_ON_TOP_LEVEL, commandBarRelative);
    ensureCommandBarWindowVisible();
    w.commandBar.moveTop();
  }

  if (w.terminal && !w.terminal.isDestroyed() && terminalWindowVisible) {
    w.terminal.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, TERMINAL_ALWAYS_ON_TOP_RELATIVE);
    ensureChromeWindowInteractive(w.terminal, "terminal");
  }

  if (w.panel && !w.panel.isDestroyed() && w.panel.isVisible()) {
    w.panel.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, PANEL_ALWAYS_ON_TOP_RELATIVE);
    w.panel.moveTop();
  }

  if (w.notesPad && !w.notesPad.isDestroyed() && notesPadVisible) {
    w.notesPad.setAlwaysOnTop(
      true,
      OVERLAY_ALWAYS_ON_TOP_LEVEL,
      NOTES_PAD_ALWAYS_ON_TOP_RELATIVE,
    );
    w.notesPad.moveTop();
  }
}

/** Re-apply OS click-through on the onboarding overlay (macOS resets this on setBounds/show). */
export function ensureOnboardingOverlayClickThrough(): void {
  if (!onboardingPending || !windows?.overlay || windows.overlay.isDestroyed()) return;
  if (onboardingOverlayForceInteractive) {
    debugSetIgnoreMouseEvents(windows.overlay, "overlay", false);
    return;
  }
  debugSetIgnoreMouseEvents(windows.overlay, "overlay", true, true);
}

/** Keep overlay fully interactive while the post-boot language picker is visible. */
export function syncLanguagePickerOverlayInteractivity(active: boolean): void {
  if (!onboardingPending || !windows?.overlay || windows.overlay.isDestroyed()) return;
  if (active) {
    onboardingOverlayForceInteractive = true;
    debugSetIgnoreMouseEvents(windows.overlay, "overlay", false);
    return;
  }
  if (onboardingOverlayForceInteractive) {
    onboardingOverlayForceInteractive = false;
    debugSetIgnoreMouseEvents(windows.overlay, "overlay", true, true);
  }
}

/** Full-screen overlay — reset to click-through (called after every showInactive). */
function configureOverlayClickThrough(overlay: BrowserWindow): void {
  if (overlay.isDestroyed()) return;
  if (overlayPaletteModalActive()) {
    debugSetIgnoreMouseEvents(overlay, "overlay", false);
    return;
  }
  if (overlayFullscreenWorkspaceActive()) {
    applyFullscreenWorkspaceOverlayMode();
    return;
  }
  if (overlayIdeInteractive()) {
    debugSetIgnoreMouseEvents(overlay, "overlay", false);
    return;
  }
  debugSetIgnoreMouseEvents(overlay, "overlay", true, true);
  if (windows && shouldShowCommandBarWindow()) {
    ensureCommandBarWindowVisible();
  }
}

/**
 * Attach a one-time cursor-changed listener to the overlay so that interactive
 * overlay elements (notification dismiss buttons, translate Hide button) receive
 * clicks.  Only "pointer"/"hand" toggle the overlay — text-cursor captions must
 * NOT block underlying app clicks.
 *
 * Called once at createOverlayWindow() time; configureOverlayClickThrough() resets
 * the OS state after each showInactive() and the listener re-arms on the next
 * cursor movement.
 */
function attachOverlayCursorClickThrough(overlay: BrowserWindow): void {
  const wc = overlay.webContents;
  // Debounce only the pass-through restore (→ ignore=true) to eliminate cursor
  // flicker when the cursor rapidly crosses button/text boundaries.
  // Going interactive (→ ignore=false) stays instant so button clicks never miss.
  // The syncOverlayPresentationRaised(false) path independently resets immediately,
  // so a pending passthrough timer cannot cause a stuck click-blocking state.
  let passthroughTimer: ReturnType<typeof setTimeout> | null = null;

  const setPassthrough = (): void => {
    if (overlayPaletteModalActive()) return;
    if (overlayIdeInteractive()) return;
    if (passthroughTimer !== null) return; // already scheduled
    passthroughTimer = setTimeout(() => {
      passthroughTimer = null;
      if (overlay.isDestroyed()) return;
      if (overlayPaletteModalActive()) return;
      if (overlayIdeInteractive()) return;
      configureOverlayClickThrough(overlay);
    }, 40);
  };

  const setInteractive = (): void => {
    if (passthroughTimer !== null) { clearTimeout(passthroughTimer); passthroughTimer = null; }
    debugSetIgnoreMouseEvents(overlay, "overlay", false);
    if (windows) raiseChromeAboveOverlay(windows);
  };

  // Called by syncOverlayPresentationRaised(false) to hard-reset without waiting.
  (overlay as BrowserWindow & { _resetPassthrough?: () => void })._resetPassthrough = () => {
    if (passthroughTimer !== null) { clearTimeout(passthroughTimer); passthroughTimer = null; }
    if (overlay.isDestroyed()) return;
    if (onboardingOverlayForceInteractive) {
      debugSetIgnoreMouseEvents(overlay, "overlay", false);
      return;
    }
    configureOverlayClickThrough(overlay);
  };

  (overlay as BrowserWindow & { _cancelPassthroughDebounced?: () => void })._cancelPassthroughDebounced =
    () => {
      if (passthroughTimer !== null) {
        clearTimeout(passthroughTimer);
        passthroughTimer = null;
      }
    };

  const allowCursorInteractiveToggle = (): boolean => overlayRaisedForNotifications;

  const onCursorChanged = (_event: Electron.Event, type: string) => {
    if (overlay.isDestroyed()) return;
    if (overlayFullscreenWorkspaceActive()) {
      if (passthroughTimer !== null) { clearTimeout(passthroughTimer); passthroughTimer = null; }
      debugSetIgnoreMouseEvents(overlay, "overlay", false);
      return;
    }
    // Language picker + Sorting Hat drive interactivity via renderer IPC — never override here.
    if (onboardingOverlayForceInteractive) {
      if (passthroughTimer !== null) { clearTimeout(passthroughTimer); passthroughTimer = null; }
      debugSetIgnoreMouseEvents(overlay, "overlay", false);
      return;
    }
    if (onboardingPending) {
      return;
    }
    // CRITICAL GUARD: the overlay is full-screen. If we call setIgnoreMouseEvents(false)
    // while captions-only / passive modes are active, the entire display becomes
    // unclickable — nothing underneath (Glass dock, commandBar, browser, apps) receives
    // any click. Only toggle interactive when notifications or onboarding UI need it.
    if (!allowCursorInteractiveToggle()) {
      // Command / powers palette / response panel — keep overlay interactive.
      if (commandPaletteOpen || powersMenuOpen || responsePanelOpen || copilotOverlayCardOpen) {
        if (passthroughTimer !== null) { clearTimeout(passthroughTimer); passthroughTimer = null; }
        debugSetIgnoreMouseEvents(overlay, "overlay", false);
        return;
      }
      // Glass IDE / builder strip / exit control: stay OS-interactive for chrome hits.
      if (
        overlayIdeInteractive()
        || overlayPointerOverBuilderStrip
        || overlayPointerOverExitControl
        || builderStripPanelOpen
        || aletheiaStripMenuOpen
        || overlayPointerOverDebriefPanel
      ) {
        if (passthroughTimer !== null) { clearTimeout(passthroughTimer); passthroughTimer = null; }
        debugSetIgnoreMouseEvents(overlay, "overlay", false);
        return;
      }
      logGlassClickDebug("cursor-changed-passive", { window: "overlay", type });
      const passiveInteractiveCursor = type === "pointer" || type === "hand";
      if (passiveInteractiveCursor) {
        if (passthroughTimer !== null) { clearTimeout(passthroughTimer); passthroughTimer = null; }
        debugSetIgnoreMouseEvents(overlay, "overlay", false);
        return;
      }
      // Cancel any pending passthrough timer and restore click-through when safe.
      if (passthroughTimer !== null) { clearTimeout(passthroughTimer); passthroughTimer = null; }
      configureOverlayClickThrough(overlay);
      return;
    }
    if (overlayPointerOverNotification) {
      setInteractive();
      return;
    }
    logGlassClickDebug("cursor-changed", { window: "overlay", type });
    const interactiveCursor = type === "pointer" || type === "hand";
    if (interactiveCursor) {
      setInteractive();
    } else if (!overlayIdeInteractive()) {
      setPassthrough();
    }
  };
  wc.on("cursor-changed", onCursorChanged);
  wc.once("destroyed", () => {
    if (passthroughTimer !== null) { clearTimeout(passthroughTimer); passthroughTimer = null; }
    wc.removeListener("cursor-changed", onCursorChanged);
  });
}

/** First-run onboarding on primary display — click-through like Glass, interactive on hover. */
function presentOnboardingOverlay(overlay: BrowserWindow): void {
  const layout = overlayLayoutFromDisplay(getPrimaryDisplayContext());
  overlay.setBounds(layout);
  overlay.setFocusable(true);
  overlay.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, OVERLAY_ALWAYS_ON_TOP_RELATIVE);
  overlay.showInactive();
  overlay.moveTop();
  if (onboardingOverlayForceInteractive) {
    debugSetIgnoreMouseEvents(overlay, "overlay", false);
  } else {
    debugSetIgnoreMouseEvents(overlay, "overlay", true, true);
  }
}

function shouldShowOverlayWindow(): boolean {
  if (overlayNoticePinned) return true;
  if (overlayPinnedForComputerOperator) return true;
  if (overlayPinnedForTranslate) return overlayMode !== "hidden";
  return overlayVisible && overlayMode !== "hidden";
}

/** Show the overlay window for live-translate captions (even if overlay chrome is hidden). */
export function setOverlayPinnedForTranslate(pinned: boolean): void {
  overlayPinnedForTranslate = pinned;
  logGlassClickDebug("setOverlayPinnedForTranslate", { pinned });
  if (glassBootPending || onboardingPending || activationPending) return;
  if (!windows?.overlay || windows.overlay.isDestroyed()) return;
  if (shouldShowOverlayWindow()) {
    if (layoutManager) {
      windows.overlay.setBounds(layoutManager.getOverlayLayout());
    }
    windows.overlay.showInactive();
    // Guard: Electron resets setIgnoreMouseEvents on show — re-apply immediately.
    configureOverlayClickThrough(windows.overlay);
  } else {
    windows.overlay.hide();
  }
  stackGlassWindows(windows);
}

/** Show the overlay window for computer-operator edge glow even when overlay chrome is hidden. */
export function setOverlayPinnedForComputerOperator(pinned: boolean): void {
  overlayPinnedForComputerOperator = pinned;
  logGlassClickDebug("setOverlayPinnedForComputerOperator", { pinned });
  if (glassBootPending || onboardingPending || activationPending) return;
  if (!windows?.overlay || windows.overlay.isDestroyed()) return;
  if (shouldShowOverlayWindow()) {
    if (layoutManager) {
      windows.overlay.setBounds(layoutManager.getOverlayLayout());
    }
    windows.overlay.showInactive();
    configureOverlayClickThrough(windows.overlay);
  } else {
    windows.overlay.hide();
  }
  stackGlassWindows(windows);
  ensureCommandBarWindowVisible();
}

/** Called when the builder strip mounts/unmounts — safety reset for OS click-through. */
export function setBuilderStripVisible(visible: boolean): void {
  if (!windows?.overlay || windows.overlay.isDestroyed()) return;
  if (!visible) {
    overlayPointerOverBuilderStrip = false;
    builderStripPanelOpen = false;
    builderStripPanelOccludesDock = false;
    builderStripPanelOccludesCommandBar = false;
    builderStripActivePanel = undefined;
    if (!overlayPointerOverNotification) {
      resetOverlayClickThroughState(windows.overlay);
    }
    return;
  }
  configureOverlayClickThrough(windows.overlay);
}

/** Reserve bottom space so the command bar sits above the builder strip band. */
export function setBuilderStripLayoutReserve(px: number): void {
  const next = Math.max(0, Math.round(px));
  if (builderStripBottomReservePx === next) return;
  builderStripBottomReservePx = next;
  applyCommandBarLayout(false);
  if (windows) stackGlassWindows(windows);
}

/** Show/hide the overlay window and raise it above the dock when notifications are active. */
export function syncOverlayPresentationRaised(raised: boolean): void {
  const wasRaised = overlayRaisedForNotifications;
  overlayNoticePinned = raised;
  overlayRaisedForNotifications = raised;
  if (glassBootPending) {
    if (windows) suppressChromeDuringBoot(windows);
    return;
  }
  if (!windows?.overlay || windows.overlay.isDestroyed()) return;
  // When the notification is dismissed, immediately restore click-through so the
  // screen never gets stuck in a click-blocking state if the cursor isn't moving.
  // _resetPassthrough also cancels any pending debounce timer from the cursor handler.
  if (!raised) {
    overlayPointerOverNotification = false;
    resetOverlayClickThroughState(windows.overlay);
  }
  if (onboardingPending) {
    if (shouldShowOverlayWindow()) {
      presentOnboardingOverlay(windows.overlay);
    } else {
      windows.overlay.hide();
    }
    return;
  }
  if (shouldShowOverlayWindow()) {
    if (layoutManager) {
      windows.overlay.setBounds(layoutManager.getOverlayLayout());
    }
    const overlayWasVisible = windows.overlay.isVisible();
    if (!overlayWasVisible || raised !== wasRaised) {
      windows.overlay.showInactive();
    }
    // Guard: Electron resets setIgnoreMouseEvents on show — re-apply immediately.
    configureOverlayClickThrough(windows.overlay);
  } else {
    windows.overlay.hide();
  }
  if (raised !== wasRaised) {
    stackGlassWindows(windows);
  }
}

/** @deprecated Use syncOverlayPresentationRaised */
export function syncOverlayNoticePinned(pinned: boolean): void {
  syncOverlayPresentationRaised(pinned);
}

function destroyGlassWindows(): void {
  stopMacVisibleFrameWatch();
  terminalWindowVisible = false;
  terminalPanelSizedByRenderer = false;
  commandBarRendererReady = false;
  deferredCommandBarLayout = null;
  clearCommandBarMountFallbackTimer();
  if (windows) {
    for (const win of [
      windows.dock,
      windows.panel,
      windows.overlay,
      windows.commandBar,
      windows.notesPad,
      windows.terminal,
    ]) {
      if (win && !win.isDestroyed()) {
        win.destroy();
      }
    }
    windows = null;
  }
  destroyTrackedGlassWindows();
}

const GLASS_WINDOW_REGISTRY_KEY = "__iivoGlassWindowIds__";

function trackedGlassWindowIds(): Set<number> {
  const globalRef = globalThis as { __iivoGlassWindowIds__?: Set<number> };
  if (!globalRef[GLASS_WINDOW_REGISTRY_KEY]) {
    globalRef[GLASS_WINDOW_REGISTRY_KEY] = new Set();
  }
  return globalRef[GLASS_WINDOW_REGISTRY_KEY];
}

function trackGlassWindow(win: BrowserWindow, windowName: string): void {
  trackedGlassWindowIds().add(win.id);
  attachGlassWindowFocusDebug(win, windowName);
  if (windowName === "dock" || windowName === "commandBar") {
    const onShow = (): void => {
      if (win.isDestroyed()) return;
      if (glassBootPending) {
        win.hide();
        return;
      }
      ensureChromeWindowInteractive(win, windowName);
      if (windows) raiseChromeAboveOverlay(windows);
    };
    win.on("show", onShow);
    win.once("closed", () => {
      win.removeListener("show", onShow);
    });
  }
  win.once("closed", () => {
    trackedGlassWindowIds().delete(win.id);
  });
}

function destroyTrackedGlassWindows(): void {
  for (const id of trackedGlassWindowIds()) {
    const win = BrowserWindow.fromId(id);
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
  }
  trackedGlassWindowIds().clear();
}

/** Keep Glass on the active Space, including when another app (e.g. browser) is fullscreen. */
function ensureVisibleOnAllWorkspaces(): void {
  if (!windows) return;
  for (const win of [windows.dock, windows.panel, windows.overlay, windows.commandBar, windows.notesPad]) {
    if (win && !win.isDestroyed()) {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
  }
}

export function beginGlassBootSequence(): void {
  glassBootPending = true;
}

/** Called when boot splash finishes or aborts — e.g. reveal first-run onboarding in renderer. */
export function setGlassBootSequenceCompleteHandler(handler: (() => void) | null): void {
  onGlassBootSequenceComplete = handler;
}

function dismissSplashWindow(): void {
  const splash = splashWindow;
  splashWindow = null;
  if (splash && !splash.isDestroyed()) {
    splash.destroy();
  }
}

function completeGlassBootSequence(): void {
  glassBootPending = false;
  dismissSplashWindow();
  if (aletheiaStripMenuOpen) {
    setAletheiaStripMenuOpen(false);
  }
  showPrimaryGlassWindows();
  ensureCommandBarWindowVisible();
  scheduleCommandBarVisibilityRetries();
  if (pendingRelayoutAfterBoot !== null) {
    const opts = pendingRelayoutAfterBoot;
    pendingRelayoutAfterBoot = null;
    relayoutAllWindows(opts);
    showPrimaryGlassWindows();
    ensureCommandBarWindowVisible();
  }
  scheduleChromeVisibilityRecovery();
  onGlassBootSequenceComplete?.();
  if (process.env.IIVO_GLASS_PROVE_BOOT === "1") {
    console.log("GLASS_BOOT_OK: splash finished, chrome shown");
    setTimeout(() => app.quit(), 400);
  }
}

/** If overlay/command bar failed to show during boot, retry once surfaces should be up. */
function scheduleChromeVisibilityRecovery(): void {
  for (const delayMs of [500, 2000, 5000]) {
    setTimeout(() => {
      if (!windows || glassBootPending || activationPending || onboardingPending) return;
      const barShouldShow =
        commandBarVisible && !ideChromeSuppressed && !windows.commandBar.isDestroyed();
      const overlayShouldShow =
        overlayVisible && overlayMode !== "hidden" && !windows.overlay.isDestroyed();
      const barHidden = barShouldShow && !windows.commandBar.isVisible();
      const overlayHidden = overlayShouldShow && !windows.overlay.isVisible();
      if (!barHidden && !overlayHidden) return;
      if (barHidden || overlayHidden) {
        console.warn(
          `[IIVO Glass] recovering chrome visibility (commandBar=${barHidden} overlay=${overlayHidden})`,
        );
      }
      showPrimaryGlassWindows();
      ensureCommandBarWindowVisible();
      stackGlassWindows(windows);
    }, delayMs);
  }
}

/** Keep dock/command bar/overlay hidden while the boot splash is up (renderer load can flash windows). */
function suppressChromeDuringBoot(w: GlassWindows): void {
  if (!glassBootPending) return;
  if (!w.dock.isDestroyed()) w.dock.hide();
  if (!w.commandBar.isDestroyed()) w.commandBar.hide();
  if (!w.overlay.isDestroyed()) w.overlay.hide();
  if (w.terminal && !w.terminal.isDestroyed()) w.terminal.hide();
}

/** Abort boot splash when the page fails to load — show Glass windows immediately. */
export function abortGlassBootSequence(reason?: string): void {
  if (!glassBootPending) return;
  if (reason) {
    console.warn(`[IIVO Glass] boot splash aborted: ${reason}`);
  }
  completeGlassBootSequence();
}

/** Hide all Glass chrome while the activation gate is showing. */
function suppressChromeDuringActivation(w: GlassWindows): void {
  if (!w.dock.isDestroyed()) w.dock.hide();
  if (!w.commandBar.isDestroyed()) w.commandBar.hide();
  if (!w.overlay.isDestroyed()) w.overlay.hide();
  if (w.panel && !w.panel.isDestroyed()) w.panel.hide();
  if (w.notesPad && !w.notesPad.isDestroyed()) w.notesPad.hide();
  if (w.terminal && !w.terminal.isDestroyed()) w.terminal.hide();
}

/** Block dock/overlay/command bar until Anthropic key activation completes. */
export function setActivationPending(pending: boolean): void {
  activationPending = pending;
  if (!windows) return;
  if (pending) {
    suppressChromeDuringActivation(windows);
    return;
  }
  if (!glassBootPending && !onboardingPending && !activationPending) {
    showPrimaryGlassWindows();
  }
}
/** Show dock, overlay, and command bar after the boot splash has finished. */
function showPrimaryGlassWindows(): void {
  if (!windows || !layoutManager) return;
  if (activationPending) {
    suppressChromeDuringActivation(windows);
    return;
  }
  if (onboardingPending) {
    if (overlayVisible && overlayMode !== "hidden" && !windows.overlay.isDestroyed()) {
      presentOnboardingOverlay(windows.overlay);
    }
    if (!windows.dock.isDestroyed()) windows.dock.hide();
    if (!windows.commandBar.isDestroyed()) windows.commandBar.hide();
    stackGlassWindows(windows);
    logDiagnostics();
    return;
  }
  if (overlayVisible && overlayMode !== "hidden" && !windows.overlay.isDestroyed()) {
    windows.overlay.setBounds(layoutManager.getOverlayLayout());
    windows.overlay.setFocusable(false);
    windows.overlay.showInactive();
    // Guard: Electron resets setIgnoreMouseEvents on show — re-apply immediately.
    configureOverlayClickThrough(windows.overlay);
  }
  if (ideChromeSuppressed) {
    if (!windows.dock.isDestroyed()) windows.dock.hide();
    if (!windows.commandBar.isDestroyed()) windows.commandBar.hide();
    stackGlassWindows(windows);
    logDiagnostics();
    return;
  }
  ensureCommandBarWindowVisible();
  if (!windows.dock.isDestroyed()) {
    applyDockLayout();
    windows.dock.showInactive();
    ensureChromeWindowInteractive(windows.dock, "dock");
  }
  stackGlassWindows(windows);
  logDiagnostics();
}

/** macOS-global Escape — skips onboarding even when the overlay cannot take focus. */
export function setOnboardingEmergencyHandler(handler: (() => void) | null): void {
  onboardingEmergencyHandler = handler;
}

export function registerOnboardingEmergencyShortcut(): void {
  if (process.env.IIVO_GLASS_E2E === "1") return;
  try {
    if (globalShortcut.isRegistered(ONBOARDING_ESCAPE_ACCEL)) {
      globalShortcut.unregister(ONBOARDING_ESCAPE_ACCEL);
    }
    const ok = globalShortcut.register(ONBOARDING_ESCAPE_ACCEL, () => {
      onboardingEmergencyHandler?.();
    });
    if (!ok) {
      console.warn("[IIVO Glass] onboarding Escape shortcut failed to register");
    }
  } catch (err) {
    console.warn("[IIVO Glass] onboarding Escape shortcut error:", err);
  }
}

export function unregisterOnboardingEmergencyShortcut(): void {
  try {
    if (globalShortcut.isRegistered(ONBOARDING_ESCAPE_ACCEL)) {
      globalShortcut.unregister(ONBOARDING_ESCAPE_ACCEL);
    }
  } catch {
    // ignore
  }
}

function pinLayoutToPrimaryDisplay(): void {
  layoutManager?.setDisplayTarget("primary");
}

/** Reset dock + command bar on the primary display after onboarding completes. */
function revealChromeAfterOnboarding(): void {
  if (!windows || !layoutManager) return;
  pinLayoutToPrimaryDisplay();
  dockCustomOrigin = null;
  commandBarCustomOrigin = null;
  chromeLayoutLocked = true;
  relayoutAllWindows({ resetDock: true });
  showPrimaryGlassWindows();
}

/** Block dock/command bar until first-run onboarding completes. */
export function setOnboardingPending(pending: boolean): void {
  onboardingPending = pending;
  if (!pending) {
    onboardingOverlayForceInteractive = false;
  }
  if (pending) {
    pinLayoutToPrimaryDisplay();
  } else {
    unregisterOnboardingEmergencyShortcut();
    revealChromeAfterOnboarding();
    return;
  }
  if (!windows || !layoutManager) return;
  showPrimaryGlassWindows();
}

/** Overlay above desktop apps; dock/panel stack above overlay via relativeLevel. */
export function stackGlassWindows(w: GlassWindows): void {
  if (glassBootPending) {
    suppressChromeDuringBoot(w);
    return;
  }
  if (activationPending) {
    suppressChromeDuringActivation(w);
    return;
  }
  if (onboardingPending) {
    if (!w.overlay.isDestroyed() && shouldShowOverlayWindow()) {
      presentOnboardingOverlay(w.overlay);
      w.overlay.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, OVERLAY_ALWAYS_ON_TOP_RELATIVE);
      w.overlay.moveTop();
    }
    return;
  }
  if (!w.overlay.isDestroyed() && shouldShowOverlayWindow()) {
    const overlayRelative = overlayRaisedForNotifications
      ? OVERLAY_RAISED_FOR_NOTIFICATIONS_RELATIVE
      : OVERLAY_ALWAYS_ON_TOP_RELATIVE;
    w.overlay.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, overlayRelative);
    const overlayWasVisible = w.overlay.isVisible();
    if (!overlayWasVisible) {
      w.overlay.showInactive();
    }
    // Guard: Electron resets setIgnoreMouseEvents on show — re-apply immediately.
    configureOverlayClickThrough(w.overlay);
  }

  if (!ideChromeSuppressed && !w.dock.isDestroyed()) {
    w.dock.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, DOCK_ALWAYS_ON_TOP_RELATIVE);
    // Use showInactive (not show) — show() steals focus from whatever app the user is in.
    w.dock.showInactive();
    ensureChromeWindowInteractive(w.dock, "dock");
  } else if (!w.dock.isDestroyed()) {
    w.dock.hide();
  }

  if (w.terminal && !w.terminal.isDestroyed() && terminalWindowVisible) {
    w.terminal.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, TERMINAL_ALWAYS_ON_TOP_RELATIVE);
    w.terminal.showInactive();
    ensureChromeWindowInteractive(w.terminal, "terminal");
  }

  if (
    overlayRaisedForNotifications &&
    !w.overlay.isDestroyed() &&
    shouldShowOverlayWindow()
  ) {
    w.overlay.moveTop();
  }

  if (!ideChromeSuppressed && !w.commandBar.isDestroyed() && commandBarVisible) {
    const commandBarRelative = overlayRaisedForNotifications
      ? COMMAND_BAR_TOP_RELATIVE
      : COMMAND_BAR_ALWAYS_ON_TOP_RELATIVE;
    w.commandBar.setAlwaysOnTop(true, COMMAND_BAR_ALWAYS_ON_TOP_LEVEL, commandBarRelative);
    ensureCommandBarWindowVisible();
    w.commandBar.moveTop();
  } else if (!w.commandBar.isDestroyed()) {
    w.commandBar.hide();
    if (!ideChromeSuppressed && !w.dock.isDestroyed()) {
      w.dock.moveTop();
    }
  } else if (!ideChromeSuppressed && !w.dock.isDestroyed()) {
    w.dock.moveTop();
  }

  if (w.panel && !w.panel.isDestroyed()) {
    w.panel.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, PANEL_ALWAYS_ON_TOP_RELATIVE);
    if (w.panel.isVisible()) {
      w.panel.moveTop();
    }
  }

  if (w.notesPad && !w.notesPad.isDestroyed() && notesPadVisible) {
    w.notesPad.setAlwaysOnTop(
      true,
      OVERLAY_ALWAYS_ON_TOP_LEVEL,
      NOTES_PAD_ALWAYS_ON_TOP_RELATIVE,
    );
    w.notesPad.showInactive();
    w.notesPad.moveTop();
  }

  // Command bar must paint above the full-screen overlay even when isVisible() is true.
  if (!ideChromeSuppressed && !w.commandBar.isDestroyed() && commandBarVisible) {
    w.commandBar.moveTop();
  }
}

function diagnosticsRect(win: BrowserWindow | null): ReturnType<typeof rectFromWindow> | null {
  if (!win || win.isDestroyed()) return null;
  return rectFromWindow(win);
}

function logDiagnostics(): void {
  if (!windows || !layoutManager) return;
  const line = formatGlassWindowDiagnostics({
    display: layoutManager.getDisplay(),
    overlay: shouldShowOverlayWindow() ? rectFromWindow(windows.overlay) : null,
    overlayVisible,
    overlayClickThrough,
    dock: rectFromWindow(windows.dock),
    panel: diagnosticsRect(windows.panel),
    panelVisible: windows.panel?.isVisible() ?? false,
    notesPad: diagnosticsRect(windows.notesPad),
    notesPadVisible,
    commandBar: commandBarVisible ? rectFromWindow(windows.commandBar) : null,
    commandBarWindowVisible: windows.commandBar.isVisible(),
  });
  logGlassWindowDiagnostics(line);
}

function dockClampOptions(): import("../shared/glassLayoutMath.ts").DockClampOptions | undefined {
  if (dockPlacement !== "left-rail") return undefined;
  return { minWidth: DOCK_RAIL_MIN_WIDTH, vertical: true };
}

function scheduleMacVisibleFrameFollowUp(): void {
  if (process.platform !== "darwin" || !windows) return;
  const snapshot = windows;
  setTimeout(() => {
    if (windows !== snapshot) return;
    ensureVisibleOnAllWorkspaces();
    stackGlassWindows(snapshot);
  }, 200);
}

function syncMacVisibleWorkAreaFromNative(): boolean {
  if (!layoutManager || process.platform !== "darwin") return false;
  const native = readMacVisibleWorkAreaSync(layoutManager.getElectronDisplay().bounds);
  if (!native) return false;
  const key = workAreaLayoutKey(native);
  if (key === lastMacVisibleWorkAreaKey) return false;
  lastMacVisibleWorkAreaKey = key;
  layoutManager.setMacVisibleWorkArea(native);
  return true;
}

async function refreshMacVisibleWorkAreaAsync(): Promise<boolean> {
  if (macVisibleFrameRefreshInFlight || !layoutManager || process.platform !== "darwin") {
    return false;
  }
  macVisibleFrameRefreshInFlight = true;
  try {
    const native = await readMacVisibleWorkArea(layoutManager.getElectronDisplay().bounds);
    if (!native) return false;
    const key = workAreaLayoutKey(native);
    if (key === lastMacVisibleWorkAreaKey) return false;
    lastMacVisibleWorkAreaKey = key;
    layoutManager.setMacVisibleWorkArea(native);
    return true;
  } finally {
    macVisibleFrameRefreshInFlight = false;
  }
}

function stopMacVisibleFrameWatch(): void {
  if (macVisibleFrameWatchTimer) {
    clearInterval(macVisibleFrameWatchTimer);
    macVisibleFrameWatchTimer = null;
  }
  lastMacVisibleWorkAreaKey = "";
  layoutManager?.clearMacVisibleWorkArea();
}

/** macOS Dock autohide — poll native visibleFrame; slower in dev to avoid main-process churn. */
const MAC_VISIBLE_FRAME_POLL_MS = app.isPackaged ? 1500 : 8000;

function startMacVisibleFrameWatch(): void {
  if (process.platform !== "darwin") return;
  stopMacVisibleFrameWatch();
  // Async only — sync swift spawn blocks the main process and can lag keyboard input app-wide.
  void refreshMacVisibleWorkAreaAsync().then((changed) => {
    if (changed) relayoutAllWindows({ resetDock: false });
  });
  macVisibleFrameWatchTimer = setInterval(() => {
    void (async () => {
      if (!(await refreshMacVisibleWorkAreaAsync())) return;
      relayoutAllWindows({ resetDock: false });
      scheduleMacVisibleFrameFollowUp();
    })();
  }, MAC_VISIBLE_FRAME_POLL_MS);
}

function isDockRail(): boolean {
  return dockPlacement === "left-rail";
}

function applyDockLayout(resetPosition = false): void {
  if (!windows?.dock || windows.dock.isDestroyed() || !layoutManager) return;
  if (!chromeLayoutLocked && !resetPosition) return;
  const current = windows.dock.getBounds();
  const clampOpts = dockClampOptions();
  const auto = layoutManager.getDockLayout(current.width, current.height, clampOpts, dockPlacement);
  const workArea = layoutManager.getDisplay().workArea;
  let next = auto;
  if (resetPosition) {
    dockCustomOrigin = null;
    next = auto;
  } else if (chromeLayoutLocked) {
    const centered = layoutManager.getDockLayout(current.width, current.height, clampOpts, dockPlacement);
    if (dockCustomOrigin) {
      next = resolveChromeWindowBounds(centered, dockCustomOrigin, workArea);
    } else if (isDockRail()) {
      next = {
        ...centered,
        width: current.width,
        height: current.height,
        x: dockLeftRailX(layoutManager.getDisplay(), current.width),
        y: resetPosition
          ? dockRailY(layoutManager.getDisplay(), current.height)
          : current.y,
      };
    } else {
      next = {
        ...centered,
        x: dockXAlignedToCommandBarForWidth(current.width),
        y: current.y,
      };
    }
  } else if (dockCustomOrigin) {
    next = resolveChromeWindowBounds(auto, dockCustomOrigin, workArea);
  } else if (!chromeLayoutLocked) {
    next = { ...auto, x: current.x, y: current.y };
  }
  if (
    current.x === next.x &&
    current.y === next.y &&
    current.width === next.width &&
    current.height === next.height
  ) {
    return;
  }
  windows.dock.setBounds(next);
  syncPanelToDockAttachment();
}

function commandBarStackHeightPx(): number {
  return lastCommandBarStackHeightPx && lastCommandBarStackHeightPx > 0
    ? lastCommandBarStackHeightPx
    : OVERLAY_CHAT_STACK_FALLBACK_PX;
}

function commandBarLayoutForCurrentDisplay(customX?: number | null) {
  return commandBarLayoutForStack(
    layoutManager!.getDisplay(),
    commandBarStackHeightPx(),
    customX,
    builderStripBottomReservePx,
  );
}

function liveCommandBarCenterX(): number | null {
  if (!windows?.commandBar || windows.commandBar.isDestroyed()) return null;
  const b = windows.commandBar.getBounds();
  return b.x + b.width / 2;
}

function dockXAlignedToCommandBarForWidth(dockWidth: number): number {
  const ctx = layoutManager!.getDisplay();
  const centerX = liveCommandBarCenterX();
  return dockXAlignedToCommandBar(ctx, dockWidth, {
    commandBarStackHeightPx: commandBarStackHeightPx(),
    commandBarCustomX: commandBarCustomOrigin?.x ?? null,
    commandBarCenterX: centerX ?? undefined,
  });
}

/** Keep the dock pill centered on the command bar when the user has not moved the dock. */
function syncDockHorizontalAlignToCommandBar(): void {
  if (!windows?.dock || windows.dock.isDestroyed() || !layoutManager || !chromeLayoutLocked) return;
  if (dockCustomOrigin || isDockRail()) return;
  const current = windows.dock.getBounds();
  const nextX = dockXAlignedToCommandBarForWidth(current.width);
  if (current.x === nextX) return;
  windows.dock.setBounds({ ...current, x: nextX });
  syncGlassTerminalWindowPosition();
}

function applyCommandBarLayout(resetPosition = false, forceLayout = false): void {
  if (!windows?.commandBar || windows.commandBar.isDestroyed() || !layoutManager) return;
  if (!forceLayout && !chromeLayoutLocked && !resetPosition) return;
  if (commandBarRendererBusy()) {
    deferredCommandBarLayout = { resetPosition, forceLayout };
    return;
  }
  const current = windows.commandBar.getBounds();
  const workArea = layoutManager.getDisplay().workArea;
  const display = layoutManager.getDisplay();
  let next;
  if (resetPosition) {
    commandBarCustomOrigin = null;
    next = commandBarLayoutForCurrentDisplay(null);
  } else if (chromeLayoutLocked) {
    const auto = commandBarLayoutForCurrentDisplay(null);
    if (commandBarCustomOrigin) {
      // User placed the bar while unlocked — keep their X/Y when locking again.
      next = clampCommandBarWindowBounds(
        resolveChromeWindowBounds(auto, commandBarCustomOrigin, workArea),
        display,
      );
    } else {
      // Fresh install / reset: bottom-centered default.
      next = auto;
    }
  } else if (commandBarCustomOrigin) {
    next = clampCommandBarWindowBounds(
      resolveChromeWindowBounds(
        commandBarLayoutForCurrentDisplay(commandBarCustomOrigin.x),
        commandBarCustomOrigin,
        workArea,
      ),
      display,
    );
  } else {
    next = clampCommandBarWindowBounds(
      { ...current, height: commandBarWindowHeightForStack(commandBarStackHeightPx()) },
      display,
    );
  }
  if (
    current.x === next.x &&
    current.y === next.y &&
    current.width === next.width &&
    current.height === next.height
  ) {
    return;
  }
  windows.commandBar.setBounds(next);
  syncDockHorizontalAlignToCommandBar();
}

function captureChromeOriginsFromWindows(): void {
  if (!windows) return;
  if (!windows.dock.isDestroyed()) {
    const b = windows.dock.getBounds();
    dockCustomOrigin = { x: b.x, y: b.y };
  }
  if (!windows.commandBar.isDestroyed()) {
    const b = windows.commandBar.getBounds();
    commandBarCustomOrigin = { x: b.x, y: b.y };
  }
}

function scheduleChromeLayoutPersist(): void {
  if (chromeMovePersistTimer) clearTimeout(chromeMovePersistTimer);
  chromeMovePersistTimer = setTimeout(() => {
    chromeMovePersistTimer = null;
    if (chromeLayoutLocked || !windows) return;
    captureChromeOriginsFromWindows();
    chromeLayoutPersist?.({
      dockCustomOrigin,
      commandBarCustomOrigin,
    });
  }, 120);
}

function applyChromeMovability(): void {
  if (!windows) return;
  const movable = !chromeLayoutLocked;
  if (!windows.dock.isDestroyed()) windows.dock.setMovable(movable);
  if (!windows.commandBar.isDestroyed()) windows.commandBar.setMovable(movable);
}

function wireChromeMoveListeners(w: GlassWindows): void {
  const onMoved = (): void => {
    if (chromeLayoutLocked) return;
    captureChromeOriginsFromWindows();
    scheduleChromeLayoutPersist();
  };
  const onDockMoved = (): void => {
    syncGlassTerminalWindowPosition();
    onMoved();
  };
  w.dock.on("moved", onDockMoved);
  w.commandBar.on("moved", onMoved);
}

export function setChromeLayoutPersistHandler(
  handler: ((partial: Partial<GlassUserSettings>) => void) | null,
): void {
  chromeLayoutPersist = handler;
}

export function syncChromeLayoutFromSettings(
  settings: GlassUserSettings,
  options?: { clearCustomOrigins?: boolean },
): void {
  chromeLayoutLocked = settings.chromeLayoutLocked;
  dockPlacement = settings.dockPlacement ?? "left-rail";
  if (options?.clearCustomOrigins) {
    dockCustomOrigin = null;
    commandBarCustomOrigin = null;
  } else {
    dockCustomOrigin = settings.dockCustomOrigin;
    commandBarCustomOrigin = settings.commandBarCustomOrigin;
  }
  applyChromeMovability();
}

/** Panel window bounds — dock-attached, above the builder strip. */
export function getPanelLayoutBounds(): PanelLayout | null {
  if (!layoutManager) return null;
  const dockBounds =
    windows?.dock && !windows.dock.isDestroyed()
      ? windows.dock.getBounds()
      : null;
  return layoutManager.getPanelLayout({
    dockBounds,
    dockPlacement,
  });
}

/** Settings window bounds — full-width dashboard band above the builder strip. */
export function getSettingsLayoutBounds(): PanelLayout | null {
  if (!layoutManager) return null;
  return layoutManager.getSettingsLayout();
}

export function getOverlayLayoutBounds(): PanelLayout | null {
  if (!layoutManager) return null;
  return layoutManager.getOverlayLayout();
}

function relayoutGlassSettingsWindow(): void {
  void import("./glassSettingsWindow.ts").then((mod) => mod.syncGlassSettingsLayout());
}

function relayoutOverlayWindow(): void {
  if (!windows?.overlay || windows.overlay.isDestroyed() || !layoutManager) return;
  windows.overlay.setBounds(layoutManager.getOverlayLayout());
  if (onboardingPending) {
    ensureOnboardingOverlayClickThrough();
  } else {
    configureOverlayClickThrough(windows.overlay);
  }
  if (shouldShowCommandBarWindow()) {
    ensureCommandBarWindowVisible();
  }
}

function relayoutChromeWindows(options?: { resetDock?: boolean }): void {
  if (!windows || !layoutManager) return;

  if (windows.panel && !windows.panel.isDestroyed()) {
    const panelLayout = getPanelLayoutBounds();
    if (panelLayout) windows.panel.setBounds(panelLayout);
  }

  if (!windows.commandBar.isDestroyed()) {
    applyCommandBarLayout(options?.resetDock ?? false);
  }

  applyDockLayout(options?.resetDock ?? false);

  if (windows.notesPad && !windows.notesPad.isDestroyed() && notesPadVisible) {
    windows.notesPad.setBounds(layoutManager.getNotesPadLayout());
  }

  notifyCommandBarLayoutChanged();
  notifyGlassDisplayLayoutChanged();
  relayoutGlassSettingsWindow();
}

function relayoutAllWindows(options?: { resetDock?: boolean }): void {
  if (!windows || !layoutManager) return;
  if (glassBootPending || skipInitialRendererLoad) {
    pendingRelayoutAfterBoot = options ?? {};
    return;
  }

  relayoutOverlayWindow();
  relayoutChromeWindows(options);

  ensureVisibleOnAllWorkspaces();
  stackGlassWindows(windows);
  logDiagnostics();
}

function wireWindowStacking(w: GlassWindows): void {
  const restack = (): void => {
    stackGlassWindows(w);
    ensureCommandBarWindowVisible();
    logDiagnostics();
  };

  w.dock.webContents.on("did-finish-load", restack);
  w.overlay.webContents.on("did-finish-load", restack);
  w.commandBar.webContents.on("did-finish-load", () => {
    scheduleCommandBarMountFallback();
    restack();
  });
  w.commandBar.webContents.on("did-start-loading", () => {
    commandBarRendererReady = false;
    clearCommandBarMountFallbackTimer();
  });
}

function createOverlayWindow(): BrowserWindow {
  const layout = layoutManager!.getOverlayLayout();
  const overlay = new BrowserWindow({
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    show: false,
    backgroundColor: "#00000000",
    acceptFirstMouse: true,
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  configureOverlayClickThrough(overlay);
  // Attach cursor-changed listener once so interactive overlay elements
  // (notification dismiss, translate Hide) become clickable when hovered.
  attachOverlayCursorClickThrough(overlay);
  loadRenderer(overlay, "overlay.html");
  trackGlassWindow(overlay, "overlay");
  return overlay;
}

function createDockWindow(): BrowserWindow {
  const layout = layoutManager!.getDockLayout(
    undefined,
    undefined,
    dockClampOptions(),
    dockPlacement,
  );
  const dock = new BrowserWindow({
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    show: false,
    backgroundColor: "#00000000",
    acceptFirstMouse: true,
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  dock.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  ensureChromeWindowInteractive(dock, "dock");
  dock.webContents.once("did-finish-load", () => {
    if (glassBootPending || onboardingPending || activationPending) dock.hide();
  });
  loadRenderer(dock, "index.html");
  trackGlassWindow(dock, "dock");
  return dock;
}

function createPanelWindow(): BrowserWindow {
  const layout = getPanelLayoutBounds() ?? layoutManager!.getPanelLayout();
  const panel = new BrowserWindow({
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    show: false,
    backgroundColor: "#00000000",
    acceptFirstMouse: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  ensureChromeWindowInteractive(panel, "panel");
  loadRenderer(panel, "panel.html");
  trackGlassWindow(panel, "panel");
  return panel;
}

function createCommandBarWindow(): BrowserWindow {
  const layout = layoutManager!.getCommandBarLayout();
  const commandBar = new BrowserWindow({
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    show: false,
    backgroundColor: "#00000000",
    acceptFirstMouse: true,
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  commandBar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  ensureChromeWindowInteractive(commandBar, "commandBar");
  commandBarRendererReady = false;
  deferredCommandBarLayout = null;
  commandBar.webContents.on("did-start-loading", () => {
    commandBarRendererReady = false;
    clearCommandBarMountFallbackTimer();
  });
  commandBar.webContents.once("did-finish-load", () => {
    scheduleCommandBarMountFallback();
  });
  commandBar.webContents.once("did-fail-load", (_event, code, desc) => {
    console.error(`[IIVO Glass] command.html failed to load (${code}): ${desc}`);
  });
  loadRenderer(commandBar, "command.html");
  trackGlassWindow(commandBar, "commandBar");

  // Native cut / copy / paste / select-all context menu for text fields
  commandBar.webContents.on("context-menu", (_event, params) => {
    const items: Electron.MenuItemConstructorOptions[] = [];
    if (params.isEditable || params.selectionText.trim().length > 0) {
      if (params.isEditable) {
        items.push({ role: "cut", label: "Cut", enabled: params.editFlags.canCut });
      }
      items.push({ role: "copy", label: "Copy", enabled: params.editFlags.canCopy });
      if (params.isEditable) {
        items.push({ role: "paste", label: "Paste", enabled: params.editFlags.canPaste });
        items.push({ type: "separator" });
        items.push({ role: "selectAll", label: "Select All" });
      }
    } else if (params.isEditable) {
      items.push({ role: "paste", label: "Paste", enabled: params.editFlags.canPaste });
      items.push({ role: "selectAll", label: "Select All" });
    }
    if (items.length > 0) {
      Menu.buildFromTemplate(items).popup({ window: commandBar });
    }
  });

  return commandBar;
}

function createNotesPadWindow(): BrowserWindow {
  const layout = layoutManager!.getNotesPadLayout();
  const notesPad = new BrowserWindow({
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
    minWidth: 300,
    minHeight: 360,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    show: false,
    backgroundColor: "#00000000",
    acceptFirstMouse: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  notesPad.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  loadRenderer(notesPad, "notes.html");
  trackGlassWindow(notesPad, "notesPad");
  return notesPad;
}

function createTerminalWindow(): BrowserWindow {
  const pad = GLASS_TERMINAL_WINDOW_PADDING_PX;
  const terminal = new BrowserWindow({
    width: GLASS_TERMINAL_DEFAULT_WIDTH + pad * 2,
    height: GLASS_TERMINAL_DEFAULT_HEIGHT + pad * 2,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    show: false,
    backgroundColor: "#00000000",
    acceptFirstMouse: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  terminal.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  ensureChromeWindowInteractive(terminal, "terminal");
  loadRenderer(terminal, "terminal.html");
  terminal.webContents.on("did-fail-load", (_event, code, desc, url) => {
    console.error(`[IIVO Glass] terminal window failed to load (${code}): ${desc} — ${url}`);
  });
  trackGlassWindow(terminal, "terminal");
  return terminal;
}

function attachLazyWindowHandlers(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
}

function wireLazyWindowStacking(win: BrowserWindow): void {
  win.webContents.on("did-finish-load", () => {
    if (windows) {
      stackGlassWindows(windows);
      logDiagnostics();
    }
  });
}

function ensurePanelWindow(): BrowserWindow {
  if (!windows) throw new Error("Glass windows not initialized");
  if (windows.panel && !windows.panel.isDestroyed()) return windows.panel;
  const panel = createPanelWindow();
  attachLazyWindowHandlers(panel);
  wireLazyWindowStacking(panel);
  windows.panel = panel;
  console.log("[IIVO Glass] panel window created (lazy)");
  return panel;
}

function ensureNotesPadWindow(): BrowserWindow {
  if (!windows) throw new Error("Glass windows not initialized");
  if (windows.notesPad && !windows.notesPad.isDestroyed()) return windows.notesPad;
  const notesPad = createNotesPadWindow();
  attachLazyWindowHandlers(notesPad);
  wireLazyWindowStacking(notesPad);
  windows.notesPad = notesPad;
  console.log("[IIVO Glass] notes pad window created (lazy)");
  return notesPad;
}

function ensureTerminalWindow(): BrowserWindow {
  if (!windows) throw new Error("Glass windows not initialized");
  if (windows.terminal && !windows.terminal.isDestroyed()) return windows.terminal;
  const terminal = createTerminalWindow();
  attachLazyWindowHandlers(terminal);
  wireLazyWindowStacking(terminal);
  windows.terminal = terminal;
  console.log("[IIVO Glass] terminal window created (lazy)");
  return terminal;
}

export function createWindows(glassConfig: GlassConfig, displayTarget: GlassDisplayTarget = "primary"): GlassWindows {
  skipInitialRendererLoad = isDev && process.platform === "darwin";
  destroyGlassWindows();
  layoutManager?.dispose();
  activeDisplayTarget = sanitizeDisplayTarget(displayTarget);
  layoutManager = new GlassLayoutManager(glassConfig.layoutPreset, activeDisplayTarget);
  layoutManager.onDisplayChanged(() => {
    const normalized = sanitizeDisplayTarget(activeDisplayTarget);
    if (normalized !== activeDisplayTarget) {
      activeDisplayTarget = normalized;
      layoutManager?.setDisplayTarget(normalized);
    }
    lastMacVisibleWorkAreaKey = "";
    syncMacVisibleWorkAreaFromNative();
    relayoutAllWindows({ resetDock: true });
    // macOS fullscreen Spaces can apply metrics slightly after the event.
    if (process.platform === "darwin" && windows) {
      scheduleMacVisibleFrameFollowUp();
    }
  });

  overlayVisible = glassConfig.overlayEnabled;
  overlayMode = glassConfig.overlayMode;
  overlayClickThrough = true;
  commandBarVisible = true;

  const overlay = createOverlayWindow();
  const dock = createDockWindow();
  const commandBar = createCommandBarWindow();

  for (const win of [dock, overlay, commandBar]) {
    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });
  }

  windows = {
    dock,
    panel: null,
    overlay,
    commandBar,
    notesPad: null,
    terminal: null,
  };

  refreshTerminalPanelWidthFromDisplay();

  wireChromeMoveListeners(windows);
  applyChromeMovability();

  if (!glassBootPending && !onboardingPending && !activationPending) {
    showPrimaryGlassWindows();
  } else {
    dock.hide();
    commandBar.hide();
    if (glassBootPending) {
      if (overlayVisible && overlayMode !== "hidden") overlay.hide();
    } else if (onboardingPending) {
      if (overlayVisible && overlayMode !== "hidden") {
        presentOnboardingOverlay(overlay);
      }
    } else if (activationPending) {
      if (overlayVisible && overlayMode !== "hidden") overlay.hide();
    }
  }

  wireWindowStacking(windows);
  ensureVisibleOnAllWorkspaces();
  stackGlassWindows(windows);
  if (glassBootPending) suppressChromeDuringBoot(windows);
  syncFollowMouseMode();
  startMacVisibleFrameWatch();
  if (layoutManager.getDisplay().workAreaSource === "macos-visible-frame") {
    relayoutAllWindows({ resetDock: true });
  }
  if (skipInitialRendererLoad && windows) {
    void runStaggeredViteRendererLoads(windows).finally(() => {
      skipInitialRendererLoad = false;
      if (pendingRelayoutAfterBoot !== null) {
        const opts = pendingRelayoutAfterBoot;
        pendingRelayoutAfterBoot = null;
        relayoutAllWindows(opts);
      }
      showPrimaryGlassWindows();
      ensureCommandBarWindowVisible();
      scheduleCommandBarVisibilityRetries();
    });
  }
  logDiagnostics();
  return windows;
}

/**
 * Full-screen cinematic boot splash shown before the Glass windows are ready.
 * Created at the very start of app startup so it appears instantly; closed via
 * {@link finishSplash} once the real windows have loaded.
 */
export function createSplashWindow(): BrowserWindow {
  if (splashWindow && !splashWindow.isDestroyed()) return splashWindow;

  const display = screen.getPrimaryDisplay();
  // workArea keeps the boot frame above the macOS dock / menu bar
  const { x, y, width, height } = display.workArea;
  const splash = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    show: false,
    backgroundColor: "#00000000",
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  // Sit above every Glass window (overlay/dock/command/panel) while booting.
  splash.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, 12);
  splash.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  debugSetIgnoreMouseEvents(splash, "splash", false);
  splash.once("ready-to-show", () => {
    if (!splash.isDestroyed()) splash.showInactive();
  });
  splash.webContents.once("did-fail-load", (_event, code, description, url) => {
    abortGlassBootSequence(`did-fail-load ${code} ${description} (${url})`);
  });
  splash.webContents.once("render-process-gone", (_event, details) => {
    abortGlassBootSequence(`render-process-gone ${details.reason}`);
  });
  loadRenderer(splash, "splash.html", {
    bootSound: GLASS_BOOT_SOUND_ENABLED ? "1" : "0",
  });
  splashWindow = splash;
  return splash;
}

/** Resolve once dock + command bar have finished their initial load (minimum visible chrome). */
export function whenPrimaryChromeReady(w: GlassWindows): Promise<void> {
  return Promise.all([waitForWindowLoad(w.dock), waitForWindowLoad(w.commandBar)]).then(
    () => undefined,
  );
}

function logChromeLoadState(w: GlassWindows, label: string): void {
  const entries: Array<[string, BrowserWindow | null]> = [
    ["dock", w.dock],
    ["panel", w.panel],
    ["overlay", w.overlay],
    ["commandBar", w.commandBar],
  ];
  const parts = entries.map(([name, win]) => {
    if (!win || win.isDestroyed()) return `${name}=none`;
    return `${name}=${win.webContents.isLoading() ? "loading" : "ready"}`;
  });
  console.log(`[IIVO Glass] boot chrome state (${label}): ${parts.join(", ")}`);
}

/** Resolve once all Glass windows have finished their initial load. */
export function whenGlassWindowsReady(w: GlassWindows): Promise<void> {
  return Promise.all([
    waitForWindowLoad(w.dock),
    waitForWindowLoad(w.overlay),
    waitForWindowLoad(w.commandBar),
  ]).then(() => undefined);
}

/** {@link whenGlassWindowsReady} with a timeout so boot cannot hang past the splash animation. */
export function whenGlassWindowsReadyOrTimeout(
  w: GlassWindows,
  timeoutMs = 45_000,
): Promise<void> {
  return Promise.race([
    whenGlassWindowsReady(w),
    new Promise<void>((resolve) => {
      setTimeout(() => {
        logChromeLoadState(w, "timeout");
        console.warn(
          `[IIVO Glass] boot: chrome load timeout after ${timeoutMs}ms — continuing`,
        );
        resolve();
      }, timeoutMs);
    }),
  ]);
}

/** End boot splash and reveal Glass chrome immediately (no blocking fade). */
export async function finishSplash(): Promise<void> {
  const splash = splashWindow;
  if (splash && !splash.isDestroyed()) {
    void splash.webContents
      .executeJavaScript(`globalThis.__iivoGlassBootSound?.playComplete?.();`, true)
      .catch(() => {});
  }
  completeGlassBootSequence();
}

export function getWindows(): GlassWindows | null {
  return windows;
}

type HiddenForCaptureEntry = {
  win: BrowserWindow;
  wasVisible: boolean;
};

let hiddenForCaptureState: HiddenForCaptureEntry[] | null = null;

function collectGlassBrowserWindows(excludeWebContents?: WebContents): BrowserWindow[] {
  const excludeWin = excludeWebContents ? BrowserWindow.fromWebContents(excludeWebContents) : null;
  const wins: BrowserWindow[] = [];
  if (windows) {
    for (const win of [
      windows.dock,
      windows.panel,
      windows.overlay,
      windows.commandBar,
      windows.notesPad,
      windows.terminal,
    ]) {
      if (win && !win.isDestroyed()) wins.push(win);
    }
  }
  if (splashWindow && !splashWindow.isDestroyed()) wins.push(splashWindow);
  return wins.filter((win) => win !== excludeWin);
}

/** Hide Glass chrome so display capture excludes our UI. Restores prior visibility via {@link restoreGlassWindowsAfterCapture}. */
export function hideGlassWindowsForCapture(excludeWebContents?: WebContents): void {
  if (hiddenForCaptureState) return;
  logGlassClickDebug("hideGlassWindowsForCapture", {
    excludeWebContentsId: excludeWebContents?.id,
  });
  const wins = collectGlassBrowserWindows(excludeWebContents);
  hiddenForCaptureState = wins.map((win) => ({ win, wasVisible: win.isVisible() }));
  for (const { win, wasVisible } of hiddenForCaptureState) {
    if (wasVisible) win.hide();
  }
}

export function restoreGlassWindowsAfterCapture(): void {
  if (!hiddenForCaptureState) return;
  logGlassClickDebug("restoreGlassWindowsAfterCapture");
  for (const { win, wasVisible } of hiddenForCaptureState) {
    if (!win.isDestroyed() && wasVisible) win.show();
  }
  hiddenForCaptureState = null;
  reconcilePrimaryChromeVisibility();
}

/** Grow or shrink the command bar window to fit the measured stack (bottom-anchored). */
export function syncCommandBarWindowToStackHeight(stackHeightPx: number): boolean {
  if (!windows?.commandBar || windows.commandBar.isDestroyed()) return false;
  const bar = windows.commandBar;
  const current = bar.getBounds();
  lastCommandBarStackHeightPx = stackHeightPx;
  const nextHeight = commandBarWindowHeightForStack(stackHeightPx);
  const display = layoutManager?.getDisplay();
  const nextY = current.y + current.height - nextHeight;
  const next = display
    ? clampCommandBarWindowBounds(
        { x: current.x, y: nextY, width: current.width, height: nextHeight },
        display,
      )
    : { x: current.x, y: nextY, width: current.width, height: nextHeight };
  if (
    current.x === next.x &&
    current.y === next.y &&
    current.width === next.width &&
    current.height === next.height
  ) {
    if (glassBootPending || onboardingPending || activationPending) {
      bar.hide();
    } else {
      ensureCommandBarWindowVisible();
    }
    return false;
  }
  logGlassClickDebug("syncCommandBarWindowToStackHeight", {
    fromHeight: current.height,
    toHeight: next.height,
    stackHeightPx,
  });
  bar.setBounds(next);
  if (glassBootPending || onboardingPending || activationPending) {
    bar.hide();
  } else {
    ensureCommandBarWindowVisible();
  }
  syncDockHorizontalAlignToCommandBar();
  notifyCommandBarLayoutChanged();
  return true;
}

export function getLayoutManager(): GlassLayoutManager | null {
  return layoutManager;
}

export function isPanelVisible(): boolean {
  return windows?.panel?.isVisible() ?? false;
}

export function isOverlayVisible(): boolean {
  return overlayVisible && overlayMode !== "hidden";
}

export function getOverlayMode(): OverlayMode {
  return overlayMode;
}

/** Re-show dock + command bar after boot, renderer load, or layout changes. */
export function reconcilePrimaryChromeVisibility(): void {
  if (!windows) return;
  showPrimaryGlassWindows();
  ensureCommandBarWindowVisible();
}

export function getGlassWindowState() {
  if (!windows || !layoutManager) {
    return buildWindowState("Glass windows: not initialized", false, true, overlayMode, false, commandBarVisible);
  }
  const diagnostics = formatGlassWindowDiagnostics({
    display: layoutManager.getDisplay(),
    overlay: shouldShowOverlayWindow() ? rectFromWindow(windows.overlay) : null,
    overlayVisible: isOverlayVisible(),
    overlayClickThrough,
    dock: rectFromWindow(windows.dock),
    panel: diagnosticsRect(windows.panel),
    panelVisible: windows.panel?.isVisible() ?? false,
    notesPad: diagnosticsRect(windows.notesPad),
    notesPadVisible,
    commandBar: commandBarVisible ? rectFromWindow(windows.commandBar) : null,
    commandBarWindowVisible: windows.commandBar.isVisible(),
  });
  return buildWindowState(
    diagnostics,
    isOverlayVisible(),
    overlayClickThrough,
    overlayMode,
    windows.panel?.isVisible() ?? false,
    commandBarVisible,
  );
}

export function getOverlayClickThrough(): boolean {
  return true;
}

export function getCommandBarClickThrough(): boolean {
  return false;
}

/** @deprecated Command bar is always interactive — no click-through toggling. */
export function resetCommandBarClickThrough(): void {}

/** @deprecated Dock is always interactive — no click-through toggling. */
export function applyDockClickThrough(_enabled: boolean): void {}

/** @deprecated Dock is always interactive — no click-through toggling. */
export function resetDockClickThrough(): void {}

/** @deprecated Click-through policies are fixed at window creation. */
export function applyGlassChromeClickThrough(): void {}

export function getDockClickThrough(): boolean {
  return false;
}

export function setOverlayClickThrough(_enabled: boolean): void {}

export function setOverlayClickThroughFromWindow(_win: BrowserWindow, _enabled: boolean): void {}

/** @deprecated Renderer IPC — honored during onboarding overlay only. */
export function setIgnoreMouseFromWindow(win: BrowserWindow, ignore: boolean): void {
  const windowName = resolveGlassWindowName(win);
  if (!windows?.overlay || win.isDestroyed() || win.id !== windows.overlay.id || !onboardingPending) {
    logGlassClickDebug("setIgnoreMouseFromWindow IPC (no-op)", {
      window: windowName,
      ignore,
    });
    return;
  }
  onboardingOverlayForceInteractive = !ignore;
  debugSetIgnoreMouseEvents(win, "overlay", ignore, ignore);
}

function resolveGlassWindowName(win: BrowserWindow): string {
  if (!windows) return `win:${win.id}`;
  if (!windows.overlay.isDestroyed() && win.id === windows.overlay.id) return "overlay";
  if (!windows.dock.isDestroyed() && win.id === windows.dock.id) return "dock";
  if (!windows.commandBar.isDestroyed() && win.id === windows.commandBar.id) return "commandBar";
  if (windows.panel && !windows.panel.isDestroyed() && win.id === windows.panel.id) return "panel";
  if (windows.notesPad && !windows.notesPad.isDestroyed() && win.id === windows.notesPad.id) return "notesPad";
  return `win:${win.id}`;
}

export function toggleOverlay(): boolean {
  if (!windows?.overlay || windows.overlay.isDestroyed()) return false;
  if (overlayMode === "hidden") {
    overlayMode = "passive";
    overlayVisible = true;
  } else {
    overlayVisible = !overlayVisible;
  }
  if (shouldShowOverlayWindow()) {
    if (layoutManager) {
      windows.overlay.setBounds(layoutManager.getOverlayLayout());
    }
    windows.overlay.showInactive();
    // Guard: Electron resets setIgnoreMouseEvents on show — re-apply immediately.
    configureOverlayClickThrough(windows.overlay);
  } else {
    windows.overlay.hide();
  }
  stackGlassWindows(windows);
  logDiagnostics();
  return overlayVisible;
}

export function setOverlayMode(mode: OverlayMode): void {
  overlayMode = mode;
  if (!windows?.overlay || windows.overlay.isDestroyed()) return;
  if (mode === "hidden") {
    overlayVisible = false;
  } else if (!overlayVisible) {
    overlayVisible = true;
  }
  if (shouldShowOverlayWindow()) {
    if (layoutManager) {
      windows.overlay.setBounds(layoutManager.getOverlayLayout());
    }
    windows.overlay.showInactive();
    // Guard: Electron resets setIgnoreMouseEvents on show — re-apply immediately.
    configureOverlayClickThrough(windows.overlay);
  } else {
    windows.overlay.hide();
  }
  stackGlassWindows(windows);
  logDiagnostics();
}

export function ensurePanelLayout(): void {
  if (!layoutManager) return;
  const panel = windows?.panel;
  if (!panel || panel.isDestroyed()) return;
  const layout = getPanelLayoutBounds();
  if (layout) panel.setBounds(layout);
}

function syncPanelToDockAttachment(): void {
  if (!windows?.panel?.isVisible()) return;
  ensurePanelLayout();
}

export function openPanel(): void {
  const panel = ensurePanelWindow();
  ensurePanelLayout();
  ensureChromeWindowInteractive(panel, "panel");
  panel.show();
  panel.focus();
  stackGlassWindows(windows!);
  logDiagnostics();
}

export function raisePanelWindow(): void {
  const panel = windows?.panel;
  if (!panel || panel.isDestroyed() || !panel.isVisible()) return;
  ensureChromeWindowInteractive(panel, "panel");
  panel.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, PANEL_ALWAYS_ON_TOP_RELATIVE);
  panel.moveTop();
}

export function closePanel(): void {
  windows?.panel?.hide();
  if (windows) stackGlassWindows(windows);
}

export function resetDockLayoutPosition(): void {
  dockCustomOrigin = null;
  applyDockLayout(true);
}

export function resizeDockWindow(
  width: number,
  height: number,
  options?: import("../shared/glassLayoutMath.ts").DockClampOptions,
): void {
  if (!windows?.dock || windows.dock.isDestroyed() || !layoutManager) return;
  const clamped = layoutManager.clampDockSize(width, height, options);
  const current = windows.dock.getBounds();
  const work = layoutManager.getDisplay().workArea;
  const edge = 24;
  let next: Electron.Rectangle;
  if (chromeLayoutLocked) {
    let nextX: number;
    let nextY: number;
    if (dockCustomOrigin) {
      nextX = Math.max(
        work.x + edge,
        Math.min(
          Math.round(current.x + current.width / 2 - clamped.width / 2),
          work.x + work.width - clamped.width - edge,
        ),
      );
      nextY = current.y;
    } else if (isDockRail()) {
      nextX = dockLeftRailX(layoutManager.getDisplay(), clamped.width);
      nextY = current.y;
    } else {
      nextX = dockXAlignedToCommandBarForWidth(clamped.width);
      nextY = current.y;
    }
    const maxY = work.y + work.height - clamped.height - edge;
    if (nextY > maxY) {
      nextY = Math.max(work.y + edge, maxY);
    }
    next = {
      x: nextX,
      y: nextY,
      width: clamped.width,
      height: clamped.height,
    };
  } else {
    next = {
      x: current.x,
      y: current.y,
      width: clamped.width,
      height: clamped.height,
    };
  }
  if (
    current.width === next.width &&
    current.height === next.height &&
    current.x === next.x &&
    current.y === next.y
  ) {
    return;
  }
  windows.dock.setBounds(next, false);
  syncGlassTerminalWindowPosition();
  syncPanelToDockAttachment();
  stackGlassWindows(windows);
}

export function isGlassTerminalWindowVisible(): boolean {
  return terminalWindowVisible;
}

export function syncGlassTerminalWindowPosition(): void {
  if (!windows?.terminal || windows.terminal.isDestroyed() || !terminalWindowVisible) return;
  applyTerminalWindowBounds();
}

function applyTerminalWindowBounds(): void {
  if (!windows?.terminal || windows.terminal.isDestroyed()) return;
  if (!windows.dock || windows.dock.isDestroyed() || !layoutManager) return;
  const work = layoutManager.getDisplay().workArea;
  const bounds = isDockRail()
    ? terminalWindowBoundsBesideDock(
        windows.dock.getBounds(),
        lastTerminalPanelWidth,
        lastTerminalPanelHeight,
        work,
      )
    : terminalWindowBoundsBelowDock(
        windows.dock.getBounds(),
        lastTerminalPanelWidth,
        lastTerminalPanelHeight,
        work,
      );
  const current = windows.terminal.getBounds();
  if (
    current.x === bounds.x &&
    current.y === bounds.y &&
    current.width === bounds.width &&
    current.height === bounds.height
  ) {
    return;
  }
  windows.terminal.setBounds(bounds, false);
}

export function showGlassTerminalWindow(): void {
  const terminal = ensureTerminalWindow();
  if (terminalDismissTimer) {
    clearTimeout(terminalDismissTimer);
    terminalDismissTimer = null;
  }
  if (!terminalPanelSizedByRenderer) {
    refreshTerminalPanelWidthFromDisplay();
  }
  terminalWindowVisible = true;
  applyTerminalWindowBounds();
  const reveal = (): void => {
    if (!windows?.terminal || windows.terminal.isDestroyed() || !terminalWindowVisible) return;
    applyTerminalWindowBounds();
    windows.terminal.show();
    ensureChromeWindowInteractive(windows.terminal, "terminal");
    windows.terminal.webContents.send(IPC.terminalWindowShown);
    stackGlassWindows(windows);
    if (isDev) {
      console.info("[IIVO Glass] terminal window shown", windows.terminal.getBounds());
    }
  };
  if (terminal.webContents.isLoadingMainFrame()) {
    terminal.webContents.once("did-finish-load", reveal);
  } else {
    reveal();
  }
}

export function dismissGlassTerminalWindow(): void {
  if (terminalDismissTimer) {
    clearTimeout(terminalDismissTimer);
    terminalDismissTimer = null;
  }
  if (!windows?.terminal || windows.terminal.isDestroyed()) return;
  terminalWindowVisible = false;
  windows.terminal.hide();
  if (windows) stackGlassWindows(windows);
}

/** Hide after the in-renderer close animation (see GLASS_TERMINAL_REVEAL_MS). */
export function scheduleDismissGlassTerminalWindow(
  delayMs = GLASS_TERMINAL_REVEAL_MS + 40,
): void {
  if (terminalDismissTimer) clearTimeout(terminalDismissTimer);
  terminalDismissTimer = setTimeout(() => {
    terminalDismissTimer = null;
    dismissGlassTerminalWindow();
  }, delayMs);
}

export function resizeGlassTerminalWindow(panelWidth: number, panelHeight: number): void {
  if (typeof panelWidth !== "number" || typeof panelHeight !== "number") return;
  if (panelWidth < 1 || panelHeight < 1) return;
  terminalPanelSizedByRenderer = true;
  lastTerminalPanelWidth = panelWidth;
  lastTerminalPanelHeight = panelHeight;
  if (terminalWindowVisible) {
    syncGlassTerminalWindowPosition();
  }
}

export function togglePanel(): boolean {
  if (!windows) return false;
  if (windows.panel?.isVisible()) {
    closePanel();
    return false;
  }
  openPanel();
  return true;
}

export function isCommandBarVisible(): boolean {
  return commandBarVisible;
}

export function focusCommandBar(): void {
  if (!windows?.commandBar || windows.commandBar.isDestroyed()) return;
  if (glassBootPending || onboardingPending || activationPending || ideChromeSuppressed) return;
  logGlassClickDebug("focusCommandBar");
  if (!commandBarVisible) {
    commandBarVisible = true;
    applyCommandBarLayout(true, true);
  }
  ensureCommandBarWindowVisible();
  windows.commandBar.show();
  windows.commandBar.focus();
  windows.commandBar.webContents.send("glass:command-bar-focus");
  stackGlassWindows(windows);
  logDiagnostics();
}

export function prefillCommandBar(text: string): void {
  if (!windows?.commandBar || windows.commandBar.isDestroyed()) return;
  focusCommandBar();
  setTimeout(() => {
    if (!windows?.commandBar || windows.commandBar.isDestroyed()) return;
    windows.commandBar.webContents.send("glass:command-bar-prefill", text);
  }, 80);
}

export function blurCommandBar(): void {
  if (!windows?.commandBar || windows.commandBar.isDestroyed()) return;
  windows.commandBar.blur();
}

export function toggleCommandBar(): boolean {
  if (!windows?.commandBar || windows.commandBar.isDestroyed()) return commandBarVisible;
  if (glassBootPending || onboardingPending || ideChromeSuppressed) return commandBarVisible;
  commandBarVisible = !commandBarVisible;
  if (commandBarVisible) {
    applyCommandBarLayout(true, true);
    ensureCommandBarWindowVisible();
  } else {
    windows.commandBar.hide();
  }
  stackGlassWindows(windows);
  logDiagnostics();
  return commandBarVisible;
}

export function broadcast(channel: string, payload: unknown): void {
  if (!windows) return;
  for (const win of [
    windows.dock,
    windows.panel,
    windows.overlay,
    windows.commandBar,
    windows.notesPad,
    windows.terminal,
  ]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

export function disposeWindows(): void {
  stopFollowMouseTracking();
  // Dispose layout manager FIRST — removes screen display-added/removed/metrics-changed
  // listeners before any window is destroyed. On macOS, quitting with an HDMI display
  // connected can fire display-removed mid-teardown; without this guard the callback
  // tries to operate on null/destroyed windows.
  layoutManager?.dispose();
  layoutManager = null;
  const splash = splashWindow;
  splashWindow = null;
  if (splash && !splash.isDestroyed()) {
    splash.destroy();
  }
  destroyGlassWindows();
}

let commandBarHotkeyStatus = "Hotkey unavailable — command bar still clickable";
let activeHotkeyPreset: GlassHotkeyPreset = "cmd-shift-space";
let activeDisplayTarget: GlassDisplayTarget = "primary";

export function getCommandBarHotkeyStatus(): string {
  return commandBarHotkeyStatus;
}

export function getActiveHotkeyPreset(): GlassHotkeyPreset {
  return activeHotkeyPreset;
}

export function getActiveDisplayTarget(): GlassDisplayTarget {
  return activeDisplayTarget;
}

export function getAvailableDisplayIds(): number[] {
  return listConnectedDisplaySnapshots().map((d) => d.id);
}

export function getConnectedDisplays() {
  return listConnectedDisplaySnapshots();
}

/** Register global shortcut to focus the command bar. Logs success/failure. */
export function registerCommandBarHotkeys(preset: GlassHotkeyPreset = activeHotkeyPreset): string {
  activeHotkeyPreset = preset;
  unregisterCommandBarHotkeys();

  const spec = GLASS_HOTKEY_PRESETS[preset];
  if (!spec.accelerator) {
    commandBarHotkeyStatus = hotkeyRegistrationMessage(preset, false, null);
    console.log(commandBarHotkeyStatus);
    return commandBarHotkeyStatus;
  }

  const fallbacks: GlassHotkeyPreset[] =
    preset === "cmd-shift-space"
      ? ["cmd-shift-space", "alt-space"]
      : [preset];

  for (const key of fallbacks) {
    const accel = GLASS_HOTKEY_PRESETS[key].accelerator;
    if (!accel) continue;
    try {
      if (globalShortcut.isRegistered(accel)) {
        globalShortcut.unregister(accel);
      }
      const ok = globalShortcut.register(accel, () => focusCommandBar());
      if (ok) {
        commandBarHotkeyStatus = hotkeyRegistrationMessage(key, true, accel);
        console.log(`Glass hotkey registered: ${accel}`);
        return commandBarHotkeyStatus;
      }
      console.warn(`Glass hotkey failed to register: ${accel}`);
    } catch (err) {
      console.warn(`Glass hotkey error for ${accel}:`, err);
    }
  }

  commandBarHotkeyStatus = hotkeyRegistrationMessage(preset, false, spec.accelerator);
  console.warn(commandBarHotkeyStatus);
  return commandBarHotkeyStatus;
}

export function unregisterCommandBarHotkeys(): void {
  globalShortcut.unregisterAll();
}

// Glass Command Palette hotkey — ⌘⇧G (Command+Shift+G). Toggles the Raycast-style
// command overlay in the always-on-top overlay window (Task #66).
const CONTEXT_ASK_ACCEL = "CommandOrControl+Shift+G";
let contextAskCallback: (() => void) | null = null;

export function registerContextAskHotkey(callback: () => void): void {
  if (process.env.IIVO_GLASS_E2E === "1") return; // skip during E2E
  contextAskCallback = callback;
  try {
    if (globalShortcut.isRegistered(CONTEXT_ASK_ACCEL)) {
      globalShortcut.unregister(CONTEXT_ASK_ACCEL);
    }
    const ok = globalShortcut.register(CONTEXT_ASK_ACCEL, () => {
      contextAskCallback?.();
    });
    if (!ok) {
      console.warn(`Glass context-ask hotkey failed to register: ${CONTEXT_ASK_ACCEL}`);
    } else {
      console.log(`Glass context-ask hotkey registered: ${CONTEXT_ASK_ACCEL}`);
    }
  } catch (err) {
    console.warn("Glass context-ask hotkey registration error:", err);
  }
}

const POWERS_MENU_ACCEL = "CommandOrControl+Shift+P";
let powersMenuCallback: (() => void) | null = null;

export function registerPowersMenuHotkey(callback: () => void): void {
  if (process.env.IIVO_GLASS_E2E === "1") return;
  powersMenuCallback = callback;
  try {
    if (globalShortcut.isRegistered(POWERS_MENU_ACCEL)) {
      globalShortcut.unregister(POWERS_MENU_ACCEL);
    }
    const ok = globalShortcut.register(POWERS_MENU_ACCEL, () => {
      powersMenuCallback?.();
    });
    if (!ok) {
      console.warn(`Glass powers-menu hotkey failed to register: ${POWERS_MENU_ACCEL}`);
    } else {
      console.log(`Glass powers-menu hotkey registered: ${POWERS_MENU_ACCEL}`);
    }
  } catch (err) {
    console.warn("Glass powers-menu hotkey registration error:", err);
  }
}

/** Compact display/layout summary for diagnostics. */
export function getDisplayLayoutSummary(): string {
  if (!layoutManager || !windows) return "display: not initialized";
  const layoutDisplay = layoutManager.getDisplay();
  const overlay = layoutManager.getOverlayLayout();
  const bar = layoutManager.getCommandBarLayout();
  const panelLayout = getPanelLayoutBounds() ?? layoutManager.getPanelLayout();
  return buildDisplayDiagnosticsSummary({
    target: activeDisplayTarget,
    layoutDisplay,
    overlayBounds: overlay,
    commandBarBounds: bar,
    panelBounds: panelLayout,
    panelVisible: windows.panel?.isVisible() ?? false,
    followMouseActive: isFollowMouseTrackingActive(),
  });
}

function syncFollowMouseMode(): void {
  stopFollowMouseTracking();
  if (activeDisplayTarget === "follow_mouse") {
    startFollowMouseTracking(activeDisplayTarget, () => relayoutAllWindows());
  } else if (activeDisplayTarget === "all_displays") {
    startFollowMouseTracking(activeDisplayTarget, () => relayoutChromeWindows());
  }
}

export function applyGlassUserSettings(settings: GlassUserSettings): void {
  const nextTarget = sanitizeDisplayTarget(settings.displayTarget);
  const displayChanged = nextTarget !== activeDisplayTarget;
  activeDisplayTarget = nextTarget;
  syncChromeLayoutFromSettings(settings, { clearCustomOrigins: displayChanged });
  if (layoutManager) {
    layoutManager.setDisplayTarget(activeDisplayTarget);
    relayoutAllWindows({ resetDock: displayChanged });
  }
  applyChromeMovability();
  syncFollowMouseMode();
  registerCommandBarHotkeys(settings.hotkeyPreset);
}

export function lockChromeLayout(): {
  dockCustomOrigin: ChromeOrigin | null;
  commandBarCustomOrigin: ChromeOrigin | null;
} {
  captureChromeOriginsFromWindows();
  chromeLayoutLocked = true;
  applyChromeMovability();
  applyDockLayout(false);
  applyCommandBarLayout(false);
  return getChromeLayoutOrigins();
}

export function unlockChromeLayout(): void {
  chromeLayoutLocked = false;
  if (windows) {
    stackGlassWindows(windows);
  }
  applyChromeMovability();
}

/** Move dock or command bar by screen delta while layout is unlocked (pointer drag). */
export function nudgeChromeWindowFromWebContents(
  sender: WebContents,
  dx: number,
  dy: number,
): void {
  if (chromeLayoutLocked || !windows || !layoutManager || (!dx && !dy)) return;
  const win = BrowserWindow.fromWebContents(sender);
  if (!win || win.isDestroyed()) return;
  if (win.id !== windows.dock.id && win.id !== windows.commandBar.id) return;

  const bounds = win.getBounds();
  const display = layoutManager.getDisplay();
  const maxBottom = commandBarMaxBottomY(display, builderStripBottomReservePx);
  let maxY = maxBottom - bounds.height;
  if (win.id === windows.commandBar.id) {
    // Bottom-anchored stack: align visible pill with the dock-safe bottom inset.
    maxY = maxBottom - bounds.height + COMMAND_BAR_ROOT_BOTTOM_PADDING_PX;
  }
  const workArea = display.workArea;
  const x = Math.max(
    workArea.x,
    Math.min(workArea.x + workArea.width - bounds.width, bounds.x + dx),
  );
  const y = Math.max(workArea.y, Math.min(maxY, bounds.y + dy));
  if (x === bounds.x && y === bounds.y) return;

  win.setBounds({ x, y, width: bounds.width, height: bounds.height });
  captureChromeOriginsFromWindows();
  scheduleChromeLayoutPersist();
  notifyCommandBarLayoutChanged();
}

export function resetChromeLayoutOrigins(): void {
  dockCustomOrigin = null;
  commandBarCustomOrigin = null;
  if (layoutManager && windows) {
    relayoutAllWindows({ resetDock: true });
  }
}

export function getChromeLayoutOrigins(): {
  dockCustomOrigin: ChromeOrigin | null;
  commandBarCustomOrigin: ChromeOrigin | null;
} {
  return { dockCustomOrigin, commandBarCustomOrigin };
}

export function refreshGlassDisplayLayout(): void {
  relayoutAllWindows({ resetDock: false });
  logDiagnostics();
}

export function setListenNotesPadVisible(active: boolean): void {
  notesPadVisible = active;
  if (!layoutManager) return;
  if (active) {
    const notesPad = ensureNotesPadWindow();
    notesPad.setBounds(layoutManager.getNotesPadLayout());
    notesPad.showInactive();
  } else if (windows?.notesPad && !windows.notesPad.isDestroyed()) {
    windows.notesPad.hide();
  }
  if (windows) {
    stackGlassWindows(windows);
    logDiagnostics();
  }
}

/** Hide dock + command bar while a full-screen workspace (IDE, dashboards, explorers) is active. */
export function setIdeChromeSuppressed(suppressed: boolean): void {
  ideChromeSuppressed = suppressed;
  if (!windows) return;
  if (suppressed) {
    if (!windows.dock.isDestroyed()) windows.dock.hide();
    if (!windows.commandBar.isDestroyed()) windows.commandBar.hide();
    stackGlassWindows(windows);
    logDiagnostics();
    return;
  }
  if (glassBootPending || onboardingPending || activationPending) return;
  ensureCommandBarWindowVisible();
  if (!windows.dock.isDestroyed()) {
    applyDockLayout();
    windows.dock.showInactive();
    ensureChromeWindowInteractive(windows.dock, "dock");
  }
  stackGlassWindows(windows);
  logDiagnostics();
}

/** @deprecated Use setIdeChromeSuppressed — kept for call-site clarity during Coder runs. */
export function setCoderWorkspaceActive(active: boolean): void {
  setIdeChromeSuppressed(active);
}

/** @deprecated Use setListenNotesPadVisible — panel no longer morphs for notes. */
export function setListenNotesPanelLayout(active: boolean): void {
  setListenNotesPadVisible(active);
}
