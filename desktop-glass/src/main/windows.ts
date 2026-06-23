/**
 * IIVO Glass — three-layer window architecture:
 * 1. Full-screen overlay (workArea + bottom safe inset, click-through by default)
 * 2. Compact dock (workArea, clickable)
 * 3. Optional side panel (workArea, clickable when open)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, globalShortcut, Menu, screen, shell, type WebContents } from "electron";
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
  clampCommandBarWindowBounds,
  commandBarLayoutForStack,
  commandBarMaxBottomY,
  commandBarWindowHeightForStack,
  COMMAND_BAR_ROOT_BOTTOM_PADDING_PX,
  dockXAlignedToCommandBar,
  glassLayoutContentBottomY,
  OVERLAY_CHAT_STACK_FALLBACK_PX,
  overlayLayoutFromDisplay,
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
  panel: BrowserWindow;
  overlay: BrowserWindow;
  commandBar: BrowserWindow;
  notesPad: BrowserWindow;
  terminal: BrowserWindow;
}

let windows: GlassWindows | null = null;
let splashWindow: BrowserWindow | null = null;
let layoutManager: GlassLayoutManager | null = null;
let overlayVisible = true;
/** Keep overlay window up for center-screen notices even when the user hid the overlay. */
let overlayNoticePinned = false;
/** Keep overlay window visible for live-translate captions when overlay chrome is hidden. */
let overlayPinnedForTranslate = false;
let overlayClickThrough = true;
let commandBarClickThrough = false;
let overlayMode: OverlayMode = "passive";
let commandBarVisible = true;
let notesPadVisible = false;
let chromeLayoutLocked = true;
let dockCustomOrigin: ChromeOrigin | null = null;
let commandBarCustomOrigin: ChromeOrigin | null = null;
let lastCommandBarStackHeightPx: number | undefined;
let chromeLayoutPersist: ((partial: Partial<GlassUserSettings>) => void) | null = null;
let chromeMovePersistTimer: ReturnType<typeof setTimeout> | null = null;
/** When true, dock/overlay/command bar stay hidden until {@link finishSplash} completes. */
let glassBootPending = false;
/** When true, onboarding blocks dock and command bar until calibration completes. */
let onboardingPending = false;
/** Renderer requested full/partial interactive overlay during onboarding (language picker, inputs). */
let onboardingOverlayForceInteractive = false;
let onGlassBootSequenceComplete: (() => void) | null = null;
const ONBOARDING_ESCAPE_ACCEL = "Escape";
let onboardingEmergencyHandler: (() => void) | null = null;

let onCommandBarLayoutChanged: (() => void) | null = null;

/** Main process hook — recompute overlay chat clearance when the bar moves or relayouts. */
export function setCommandBarLayoutChangedHandler(handler: (() => void) | null): void {
  onCommandBarLayoutChanged = handler;
}

function notifyCommandBarLayoutChanged(): void {
  onCommandBarLayoutChanged?.();
}

function loadRenderer(
  win: BrowserWindow,
  htmlFile: RendererPage,
  query?: Record<string, string>,
): void {
  const qs =
    query && Object.keys(query).length > 0
      ? `?${new URLSearchParams(query).toString()}`
      : "";
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${htmlFile}${qs}`);
  } else {
    void win.loadFile(join(mainDir, `../renderer/${htmlFile}`), {
      query: query ?? {},
    });
  }
}

/** Overlay above desktop apps; interactive windows stack above overlay via relativeLevel. */
const OVERLAY_ALWAYS_ON_TOP_LEVEL = "screen-saver" as const;
const OVERLAY_ALWAYS_ON_TOP_RELATIVE = 0;
const OVERLAY_RAISED_FOR_NOTIFICATIONS_RELATIVE = 3;
/** Chrome uses panel type on macOS — keep well above overlay relative levels. */
const DOCK_ALWAYS_ON_TOP_RELATIVE = 8;
const TERMINAL_ALWAYS_ON_TOP_RELATIVE = 9;
const COMMAND_BAR_ALWAYS_ON_TOP_RELATIVE = 10;
const COMMAND_BAR_TOP_RELATIVE = 12;
const NOTES_PAD_ALWAYS_ON_TOP_RELATIVE = 14;
const PANEL_ALWAYS_ON_TOP_RELATIVE = 16;

let overlayRaisedForNotifications = false;
let overlayPointerOverNotification = false;
let overlayPointerOverDebriefPanel = false;
/** When true, dock + command bar stay hidden while Glass IDE / Coder workspace is active. */
let ideChromeSuppressed = false;
let overlayPointerOverBuilderStrip = false;
/** Glass IDE session open — keep overlay OS-interactive for splits, tree, composer. */
let overlayIdeActive = false;
let overlayPointerOverIde = false;
let builderStripPanelOpen = false;
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

function overlayIdeInteractive(): boolean {
  return overlayIdeActive || overlayPointerOverIde;
}

function applyBuilderStripOverlayInteractivity(): void {
  if (!windows?.overlay || windows.overlay.isDestroyed()) return;
  if (overlayPaletteModalActive()) {
    debugSetIgnoreMouseEvents(windows.overlay, "overlay", false);
    return;
  }
  const interactive =
    overlayIdeInteractive()
    || overlayPointerOverBuilderStrip
    || builderStripPanelOpen
    || overlayPointerOverDebriefPanel;
  if (!interactive) {
    if (!overlayPointerOverNotification) {
      resetOverlayClickThroughState(windows.overlay);
    }
    return;
  }
  debugSetIgnoreMouseEvents(windows.overlay, "overlay", false);
}

/** Main: Glass IDE opened/closed — session-wide overlay interactivity. */
export function setOverlayIdeActive(active: boolean): void {
  overlayIdeActive = active;
  if (!active) overlayPointerOverIde = false;
  applyBuilderStripOverlayInteractivity();
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
  overlayPointerOverBuilderStrip = over;
  applyBuilderStripOverlayInteractivity();
}

/** Renderer reports a builder strip panel is open — keep overlay interactive until closed. */
export function setBuilderStripPanelOpen(open: boolean): void {
  builderStripPanelOpen = open;
  applyBuilderStripOverlayInteractivity();
}

function applyOverlayPaletteModalInteractivity(): void {
  if (!windows?.overlay || windows.overlay.isDestroyed()) return;
  const overlay = windows.overlay;
  const cancelPassthrough = (overlay as BrowserWindow & { _cancelPassthroughDebounced?: () => void })
    ._cancelPassthroughDebounced;
  if (!commandPaletteOpen && !powersMenuOpen && !responsePanelOpen && !copilotOverlayCardOpen) {
    overlay.setFocusable(false);
    if (
      !overlayIdeInteractive()
      && !overlayPointerOverBuilderStrip
      && !builderStripPanelOpen
      && !overlayPointerOverNotification
      && !overlayPointerOverDebriefPanel
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
}

/** ⌘⇧P powers menu — same overlay modal capture as command palette. */
export function setPowersMenuOpen(open: boolean): void {
  powersMenuOpen = open;
  applyOverlayPaletteModalInteractivity();
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
  if (!glassBootPending && !onboardingPending) {
    win.moveTop();
  }
}

/** Dock + command bar must stay above a temporarily interactive full-screen overlay. */
function raiseChromeAboveOverlay(w: GlassWindows): void {
  if (glassBootPending || onboardingPending) return;

  if (!w.dock.isDestroyed()) {
    w.dock.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, DOCK_ALWAYS_ON_TOP_RELATIVE);
    ensureChromeWindowInteractive(w.dock, "dock");
  }

  if (!w.commandBar.isDestroyed() && commandBarVisible) {
    const commandBarRelative = overlayRaisedForNotifications
      ? COMMAND_BAR_TOP_RELATIVE
      : COMMAND_BAR_ALWAYS_ON_TOP_RELATIVE;
    w.commandBar.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, commandBarRelative);
    ensureChromeWindowInteractive(w.commandBar, "commandBar");
  }

  if (!w.terminal.isDestroyed() && terminalWindowVisible) {
    w.terminal.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, TERMINAL_ALWAYS_ON_TOP_RELATIVE);
    ensureChromeWindowInteractive(w.terminal, "terminal");
  }

  if (!w.panel.isDestroyed() && w.panel.isVisible()) {
    w.panel.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, PANEL_ALWAYS_ON_TOP_RELATIVE);
    w.panel.moveTop();
  }

  if (!w.notesPad.isDestroyed() && notesPadVisible) {
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
  if (overlayIdeInteractive()) {
    debugSetIgnoreMouseEvents(overlay, "overlay", false);
    return;
  }
  debugSetIgnoreMouseEvents(overlay, "overlay", true, true);
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
      // Glass IDE / builder strip: stay OS-interactive for splits, tree, tab buttons.
      if (
        overlayIdeInteractive()
        || overlayPointerOverBuilderStrip
        || builderStripPanelOpen
      ) {
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
    const interactiveCursor =
      type === "pointer" ||
      type === "hand" ||
      type === "text" ||
      type === "ibeam" ||
      type === "vertical-text" ||
      type === "col-resize" ||
      type === "row-resize" ||
      type === "ew-resize" ||
      type === "ns-resize";
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
  if (overlayPinnedForTranslate) return overlayMode !== "hidden";
  return overlayVisible && overlayMode !== "hidden";
}

/** Show the overlay window for live-translate captions (even if overlay chrome is hidden). */
export function setOverlayPinnedForTranslate(pinned: boolean): void {
  overlayPinnedForTranslate = pinned;
  logGlassClickDebug("setOverlayPinnedForTranslate", { pinned });
  if (glassBootPending || onboardingPending) return;
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

/** Called when the builder strip mounts/unmounts — safety reset for OS click-through. */
export function setBuilderStripVisible(visible: boolean): void {
  if (!windows?.overlay || windows.overlay.isDestroyed()) return;
  if (!visible) {
    overlayPointerOverBuilderStrip = false;
    builderStripPanelOpen = false;
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
    windows.overlay.showInactive();
    // Guard: Electron resets setIgnoreMouseEvents on show — re-apply immediately.
    configureOverlayClickThrough(windows.overlay);
  } else {
    windows.overlay.hide();
  }
  stackGlassWindows(windows);
}

/** @deprecated Use syncOverlayPresentationRaised */
export function syncOverlayNoticePinned(pinned: boolean): void {
  syncOverlayPresentationRaised(pinned);
}

function destroyGlassWindows(): void {
  terminalWindowVisible = false;
  terminalPanelSizedByRenderer = false;
  if (windows) {
    for (const win of [
      windows.dock,
      windows.panel,
      windows.overlay,
      windows.commandBar,
      windows.notesPad,
      windows.terminal,
    ]) {
      if (!win.isDestroyed()) {
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
    if (!win.isDestroyed()) {
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
  showPrimaryGlassWindows();
  onGlassBootSequenceComplete?.();
}

/** Keep dock/command bar/overlay hidden while the boot splash is up (renderer load can flash windows). */
function suppressChromeDuringBoot(w: GlassWindows): void {
  if (!glassBootPending) return;
  if (!w.dock.isDestroyed()) w.dock.hide();
  if (!w.commandBar.isDestroyed()) w.commandBar.hide();
  if (!w.overlay.isDestroyed()) w.overlay.hide();
  if (!w.terminal.isDestroyed()) w.terminal.hide();
}

/** Abort boot splash when the page fails to load — show Glass windows immediately. */
export function abortGlassBootSequence(reason?: string): void {
  if (!glassBootPending) return;
  if (reason) {
    console.warn(`[IIVO Glass] boot splash aborted: ${reason}`);
  }
  completeGlassBootSequence();
}

/** Show dock, overlay, and command bar after the boot splash has finished. */
function showPrimaryGlassWindows(): void {
  if (!windows || !layoutManager) return;
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
  if (commandBarVisible && !windows.commandBar.isDestroyed()) {
    applyCommandBarLayout();
    windows.commandBar.showInactive();
    // Re-apply last known interactive state; Electron resets setIgnoreMouseEvents on show
    // but cursor-changed won't re-fire if cursor hasn't moved — preserve the state.
    ensureChromeWindowInteractive(windows.commandBar, "commandBar");
  }
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
    w.overlay.showInactive();
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

  if (!w.terminal.isDestroyed() && terminalWindowVisible) {
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
    w.commandBar.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, commandBarRelative);
    w.commandBar.showInactive();
    w.commandBar.moveTop();
    ensureChromeWindowInteractive(w.commandBar, "commandBar");
  } else if (!w.commandBar.isDestroyed()) {
    w.commandBar.hide();
    if (!ideChromeSuppressed && !w.dock.isDestroyed()) {
      w.dock.moveTop();
    }
  } else if (!ideChromeSuppressed && !w.dock.isDestroyed()) {
    w.dock.moveTop();
  }

  w.panel.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, PANEL_ALWAYS_ON_TOP_RELATIVE);
  if (w.panel.isVisible()) {
    w.panel.moveTop();
  }

  if (!w.notesPad.isDestroyed() && notesPadVisible) {
    w.notesPad.setAlwaysOnTop(
      true,
      OVERLAY_ALWAYS_ON_TOP_LEVEL,
      NOTES_PAD_ALWAYS_ON_TOP_RELATIVE,
    );
    w.notesPad.showInactive();
    w.notesPad.moveTop();
  }
}

function logDiagnostics(): void {
  if (!windows || !layoutManager) return;
  const line = formatGlassWindowDiagnostics({
    display: layoutManager.getDisplay(),
    overlay: shouldShowOverlayWindow() ? rectFromWindow(windows.overlay) : null,
    overlayVisible,
    overlayClickThrough,
    dock: rectFromWindow(windows.dock),
    panel: rectFromWindow(windows.panel),
    panelVisible: windows.panel.isVisible(),
    notesPad: rectFromWindow(windows.notesPad),
    notesPadVisible,
    commandBar: commandBarVisible ? rectFromWindow(windows.commandBar) : null,
  });
  logGlassWindowDiagnostics(line);
}

function applyDockLayout(resetPosition = false): void {
  if (!windows?.dock || windows.dock.isDestroyed() || !layoutManager) return;
  if (!chromeLayoutLocked && !resetPosition) return;
  const current = windows.dock.getBounds();
  const auto = layoutManager.getDockLayout(current.width, current.height);
  const workArea = layoutManager.getDisplay().workArea;
  let next = auto;
  if (resetPosition) {
    dockCustomOrigin = null;
    next = {
      ...auto,
      x: dockXAlignedToCommandBarForWidth(auto.width),
      y: auto.y,
    };
  } else if (chromeLayoutLocked) {
    // Locked: align to command bar center; keep the pill at its current screen Y when resizing.
    const centered = layoutManager.getDockLayout(current.width, current.height);
    if (dockCustomOrigin) {
      next = resolveChromeWindowBounds(centered, dockCustomOrigin, workArea);
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
  if (dockCustomOrigin) return;
  const current = windows.dock.getBounds();
  const nextX = dockXAlignedToCommandBarForWidth(current.width);
  if (current.x === nextX) return;
  windows.dock.setBounds({ ...current, x: nextX });
  syncGlassTerminalWindowPosition();
}

function applyCommandBarLayout(resetPosition = false): void {
  if (!windows?.commandBar || windows.commandBar.isDestroyed() || !layoutManager) return;
  if (!chromeLayoutLocked && !resetPosition) return;
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
  if (options?.clearCustomOrigins) {
    dockCustomOrigin = null;
    commandBarCustomOrigin = null;
  } else {
    dockCustomOrigin = settings.dockCustomOrigin;
    commandBarCustomOrigin = settings.commandBarCustomOrigin;
  }
  applyChromeMovability();
}

function relayoutAllWindows(options?: { resetDock?: boolean }): void {
  if (!windows || !layoutManager) return;

  if (!windows.overlay.isDestroyed()) {
    windows.overlay.setBounds(layoutManager.getOverlayLayout());
    // macOS resets setIgnoreMouseEvents as a side effect of repositioning.
    if (onboardingPending) {
      ensureOnboardingOverlayClickThrough();
    } else {
      configureOverlayClickThrough(windows.overlay);
    }
  }

  if (!windows.panel.isDestroyed()) {
    windows.panel.setBounds(layoutManager.getPanelLayout());
  }

  if (!windows.commandBar.isDestroyed()) {
    applyCommandBarLayout(options?.resetDock ?? false);
  }

  applyDockLayout(options?.resetDock ?? false);

  if (!windows.notesPad.isDestroyed() && notesPadVisible) {
    windows.notesPad.setBounds(layoutManager.getNotesPadLayout());
  }

  ensureVisibleOnAllWorkspaces();
  stackGlassWindows(windows);
  logDiagnostics();
  notifyCommandBarLayoutChanged();
}

function wireWindowStacking(w: GlassWindows): void {
  const restack = (): void => {
    stackGlassWindows(w);
    logDiagnostics();
  };

  w.dock.webContents.on("did-finish-load", restack);
  w.overlay.webContents.on("did-finish-load", restack);
  w.panel.webContents.on("did-finish-load", restack);
  w.commandBar.webContents.on("did-finish-load", restack);
  w.notesPad.webContents.on("did-finish-load", restack);
  w.terminal.webContents.on("did-finish-load", restack);
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
  const layout = layoutManager!.getDockLayout();
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
    if (glassBootPending || onboardingPending) dock.hide();
  });
  loadRenderer(dock, "index.html");
  trackGlassWindow(dock, "dock");
  return dock;
}

function createPanelWindow(): BrowserWindow {
  const layout = layoutManager!.getPanelLayout();
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
  commandBar.webContents.once("did-finish-load", () => {
    if (glassBootPending || onboardingPending) commandBar.hide();
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

export function createWindows(glassConfig: GlassConfig, displayTarget: GlassDisplayTarget = "primary"): GlassWindows {
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
    relayoutAllWindows({ resetDock: true });
    // macOS fullscreen Spaces can apply metrics slightly after the event.
    if (process.platform === "darwin" && windows) {
      const snapshot = windows;
      setTimeout(() => {
        if (windows !== snapshot) return;
        ensureVisibleOnAllWorkspaces();
        stackGlassWindows(snapshot);
      }, 200);
    }
  });

  overlayVisible = glassConfig.overlayEnabled;
  overlayMode = glassConfig.overlayMode;
  overlayClickThrough = true;
  commandBarVisible = true;

  const overlay = createOverlayWindow();
  const dock = createDockWindow();
  const panel = createPanelWindow();
  const commandBar = createCommandBarWindow();
  const notesPad = createNotesPadWindow();
  const terminal = createTerminalWindow();

  for (const win of [dock, panel, overlay, commandBar, notesPad, terminal]) {
    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });
  }

  windows = { dock, panel, overlay, commandBar, notesPad, terminal };

  refreshTerminalPanelWidthFromDisplay();

  wireChromeMoveListeners(windows);
  applyChromeMovability();

  if (!glassBootPending && !onboardingPending) {
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
    }
  }

  wireWindowStacking(windows);
  ensureVisibleOnAllWorkspaces();
  stackGlassWindows(windows);
  if (glassBootPending) suppressChromeDuringBoot(windows);
  syncFollowMouseMode();
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

/** Resolve once all Glass windows have finished their initial load. */
export function whenGlassWindowsReady(w: GlassWindows): Promise<void> {
  const ready = (win: BrowserWindow): Promise<void> =>
    new Promise((resolve) => {
      if (win.isDestroyed() || !win.webContents.isLoading()) {
        resolve();
        return;
      }
      const done = (): void => resolve();
      win.webContents.once("did-finish-load", done);
      win.webContents.once("did-fail-load", done);
    });
  return Promise.all([w.dock, w.panel, w.overlay, w.commandBar].map(ready)).then(() => undefined);
}

function fadeOutWindow(win: BrowserWindow, durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    const steps = 14;
    const stepMs = Math.max(8, durationMs / steps);
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      if (win.isDestroyed()) {
        clearInterval(timer);
        resolve();
        return;
      }
      win.setOpacity(Math.max(0, 1 - i / steps));
      if (i >= steps) {
        clearInterval(timer);
        resolve();
      }
    }, stepMs);
  });
}

/** Snap the progress bar to 100%, fade the splash out, then close it. */
export async function finishSplash(): Promise<void> {
  const splash = splashWindow;
  splashWindow = null;
  if (!splash || splash.isDestroyed()) {
    completeGlassBootSequence();
    return;
  }
  try {
    await splash.webContents.executeJavaScript(
      `document.body?.classList.add('is-finishing');
       document.querySelector('.glass-boot')?.classList.add('is-finishing');
       globalThis.__iivoGlassBootSound?.playComplete?.();`,
      true,
    );
  } catch {
    // Renderer may not be ready; proceed to fade out regardless.
  }
  await new Promise((resolve) => setTimeout(resolve, 420));
  await fadeOutWindow(splash, 380);
  if (!splash.isDestroyed()) splash.destroy();
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
      if (!win.isDestroyed()) wins.push(win);
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
    if (glassBootPending || onboardingPending) bar.hide();
    return false;
  }
  logGlassClickDebug("syncCommandBarWindowToStackHeight", {
    fromHeight: current.height,
    toHeight: next.height,
    stackHeightPx,
  });
  bar.setBounds(next);
  if (glassBootPending || onboardingPending) bar.hide();
  ensureChromeWindowInteractive(bar, "commandBar");
  syncDockHorizontalAlignToCommandBar();
  notifyCommandBarLayoutChanged();
  return true;
}

export function getLayoutManager(): GlassLayoutManager | null {
  return layoutManager;
}

export function isPanelVisible(): boolean {
  return windows?.panel.isVisible() ?? false;
}

export function isOverlayVisible(): boolean {
  return overlayVisible && overlayMode !== "hidden";
}

export function getOverlayMode(): OverlayMode {
  return overlayMode;
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
    panel: rectFromWindow(windows.panel),
    panelVisible: windows.panel.isVisible(),
    notesPad: rectFromWindow(windows.notesPad),
    notesPadVisible,
    commandBar: commandBarVisible ? rectFromWindow(windows.commandBar) : null,
  });
  return buildWindowState(
    diagnostics,
    isOverlayVisible(),
    overlayClickThrough,
    overlayMode,
    windows.panel.isVisible(),
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
  if (!windows.panel.isDestroyed() && win.id === windows.panel.id) return "panel";
  if (!windows.notesPad.isDestroyed() && win.id === windows.notesPad.id) return "notesPad";
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

export function openPanel(): void {
  if (!windows?.panel || windows.panel.isDestroyed()) return;
  if (layoutManager) {
    windows.panel.setBounds(layoutManager.getPanelLayout());
  }
  windows.panel.show();
  stackGlassWindows(windows);
  logDiagnostics();
}

export function closePanel(): void {
  windows?.panel.hide();
  if (windows) stackGlassWindows(windows);
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
    const nextX = dockCustomOrigin
      ? Math.max(
          work.x + edge,
          Math.min(
            Math.round(current.x + current.width / 2 - clamped.width / 2),
            work.x + work.width - clamped.width - edge,
          ),
        )
      : dockXAlignedToCommandBarForWidth(clamped.width);
    // Grow downward from the dock pill — never re-anchor Y to the default top slot.
    let y = current.y;
    const maxY = work.y + work.height - clamped.height - edge;
    if (y > maxY) {
      y = Math.max(work.y + edge, maxY);
    }
    next = {
      x: nextX,
      y,
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
  const bounds = terminalWindowBoundsBelowDock(
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
  if (!windows?.terminal || windows.terminal.isDestroyed()) {
    if (isDev) console.warn("[IIVO Glass] showGlassTerminalWindow: no terminal window");
    return;
  }
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
  if (windows.terminal.webContents.isLoadingMainFrame()) {
    windows.terminal.webContents.once("did-finish-load", reveal);
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
  if (windows.panel.isVisible()) {
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
  if (glassBootPending || onboardingPending || ideChromeSuppressed) return;
  logGlassClickDebug("focusCommandBar");
  if (!commandBarVisible) {
    commandBarVisible = true;
    if (layoutManager) {
      windows.commandBar.setBounds(layoutManager.getCommandBarLayout());
    }
  }
  windows.commandBar.show();
  windows.commandBar.focus();
  windows.commandBar.webContents.send("glass:command-bar-focus");
  stackGlassWindows(windows);
  logDiagnostics();
}

export function prefillCommandBar(text: string): void {
  if (!windows?.commandBar || windows.commandBar.isDestroyed()) return;
  focusCommandBar();
  // Brief delay so focus + click-through settle before prefill lands in the input.
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
    if (layoutManager) {
      windows.commandBar.setBounds(layoutManager.getCommandBarLayout());
    }
    windows.commandBar.showInactive();
    ensureChromeWindowInteractive(windows.commandBar, "commandBar");
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
    if (!win.isDestroyed()) {
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
  const panelLayout = layoutManager.getPanelLayout();
  return buildDisplayDiagnosticsSummary({
    target: activeDisplayTarget,
    layoutDisplay,
    overlayBounds: overlay,
    commandBarBounds: bar,
    panelBounds: panelLayout,
    panelVisible: windows.panel.isVisible(),
    followMouseActive: isFollowMouseTrackingActive(),
  });
}

function syncFollowMouseMode(): void {
  stopFollowMouseTracking();
  if (activeDisplayTarget === "follow_mouse") {
    startFollowMouseTracking("follow_mouse", () => relayoutAllWindows());
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
  if (!windows?.notesPad || windows.notesPad.isDestroyed() || !layoutManager) return;
  if (active) {
    windows.notesPad.setBounds(layoutManager.getNotesPadLayout());
    windows.notesPad.showInactive();
  } else {
    windows.notesPad.hide();
  }
  stackGlassWindows(windows);
  logDiagnostics();
}

/** Hide dock + command bar while Glass IDE or Coder workspace is active. */
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
  if (glassBootPending || onboardingPending) return;
  if (commandBarVisible && !windows.commandBar.isDestroyed()) {
    applyCommandBarLayout();
    windows.commandBar.showInactive();
    ensureChromeWindowInteractive(windows.commandBar, "commandBar");
  }
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
