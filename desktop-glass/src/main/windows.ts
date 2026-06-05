/**
 * IIVO Glass — three-layer window architecture:
 * 1. Full-screen overlay (workArea + bottom safe inset, click-through by default)
 * 2. Compact dock (workArea, clickable)
 * 3. Optional side panel (workArea, clickable when open)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BrowserWindow, globalShortcut, screen, shell, type WebContents } from "electron";
import { GLASS_BOOT_SOUND_ENABLED } from "../shared/bootSound.ts";
import type { GlassConfig } from "../shared/config.ts";
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
import { GlassLayoutManager } from "./glassLayoutManager.ts";
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

const isDev = !!process.env.ELECTRON_RENDERER_URL;
const preloadPath = join(__dirname, "../preload/index.mjs");

type RendererPage =
  | "index.html"
  | "panel.html"
  | "overlay.html"
  | "command.html"
  | "splash.html"
  | "splash-background.html";

export interface GlassWindows {
  dock: BrowserWindow;
  panel: BrowserWindow;
  overlay: BrowserWindow;
  commandBar: BrowserWindow;
}

let windows: GlassWindows | null = null;
let splashWindow: BrowserWindow | null = null;
let layoutManager: GlassLayoutManager | null = null;
let overlayVisible = true;
let overlayClickThrough = true;
let commandBarClickThrough = false;
let overlayMode: OverlayMode = "passive";
let commandBarVisible = true;
let chromeLayoutLocked = true;
let dockCustomOrigin: ChromeOrigin | null = null;
let commandBarCustomOrigin: ChromeOrigin | null = null;
let chromeLayoutPersist: ((partial: Partial<GlassUserSettings>) => void) | null = null;
let chromeMovePersistTimer: ReturnType<typeof setTimeout> | null = null;
/** When true, dock/overlay/command bar stay hidden until {@link finishSplash} completes. */
let glassBootPending = false;

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
    void win.loadFile(join(__dirname, `../renderer/${htmlFile}`), {
      query: query ?? {},
    });
  }
}

/** Overlay above desktop apps; interactive windows stack above overlay via relativeLevel. */
const OVERLAY_ALWAYS_ON_TOP_LEVEL = "screen-saver" as const;
const OVERLAY_ALWAYS_ON_TOP_RELATIVE = 0;
const DOCK_ALWAYS_ON_TOP_RELATIVE = 1;
const COMMAND_BAR_ALWAYS_ON_TOP_RELATIVE = 2;
const PANEL_ALWAYS_ON_TOP_RELATIVE = 3;

function applyOverlayClickThrough(overlay: BrowserWindow, enabled: boolean): void {
  overlayClickThrough = enabled;
  if (enabled) {
    overlay.setIgnoreMouseEvents(true, { forward: true });
  } else {
    overlay.setIgnoreMouseEvents(false);
  }
}

function destroyGlassWindows(): void {
  if (windows) {
    for (const win of [windows.dock, windows.panel, windows.overlay, windows.commandBar]) {
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

function trackGlassWindow(win: BrowserWindow): void {
  trackedGlassWindowIds().add(win.id);
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
  for (const win of [windows.dock, windows.panel, windows.overlay, windows.commandBar]) {
    if (!win.isDestroyed()) {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
  }
}

export function beginGlassBootSequence(): void {
  glassBootPending = true;
}

/** Abort boot splash when the page fails to load — show Glass windows immediately. */
export function abortGlassBootSequence(reason?: string): void {
  if (!glassBootPending) return;
  if (reason) {
    console.warn(`[IIVO Glass] boot splash aborted: ${reason}`);
  }
  glassBootPending = false;
  const splash = splashWindow;
  splashWindow = null;
  if (splash && !splash.isDestroyed()) {
    splash.close();
  }
  showPrimaryGlassWindows();
}

/** Show dock, overlay, and command bar after the boot splash has finished. */
function showPrimaryGlassWindows(): void {
  if (!windows || !layoutManager) return;
  if (overlayVisible && overlayMode !== "hidden" && !windows.overlay.isDestroyed()) {
    windows.overlay.setBounds(layoutManager.getOverlayLayout());
    windows.overlay.showInactive();
    applyOverlayClickThrough(windows.overlay, true);
  }
  if (commandBarVisible && !windows.commandBar.isDestroyed()) {
    windows.commandBar.setBounds(layoutManager.getCommandBarLayout());
    windows.commandBar.showInactive();
  }
  stackGlassWindows(windows);
  logDiagnostics();
}

/** Overlay above desktop apps; dock/panel stack above overlay via relativeLevel. */
export function stackGlassWindows(w: GlassWindows): void {
  if (glassBootPending) return;
  if (!w.overlay.isDestroyed() && overlayVisible) {
    w.overlay.setAlwaysOnTop(
      true,
      OVERLAY_ALWAYS_ON_TOP_LEVEL,
      OVERLAY_ALWAYS_ON_TOP_RELATIVE,
    );
    applyOverlayClickThrough(w.overlay, overlayClickThrough);
    w.overlay.showInactive();
  }

  w.dock.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, DOCK_ALWAYS_ON_TOP_RELATIVE);
  w.dock.show();
  w.dock.moveTop();

  if (!w.commandBar.isDestroyed() && commandBarVisible) {
    w.commandBar.setAlwaysOnTop(
      true,
      OVERLAY_ALWAYS_ON_TOP_LEVEL,
      COMMAND_BAR_ALWAYS_ON_TOP_RELATIVE,
    );
    w.commandBar.showInactive();
    w.commandBar.moveTop();
  }

  w.panel.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL, PANEL_ALWAYS_ON_TOP_RELATIVE);
  if (w.panel.isVisible()) {
    w.panel.moveTop();
  }
}

function logDiagnostics(): void {
  if (!windows || !layoutManager) return;
  const line = formatGlassWindowDiagnostics({
    display: layoutManager.getDisplay(),
    overlay: overlayVisible ? rectFromWindow(windows.overlay) : null,
    overlayVisible,
    overlayClickThrough,
    dock: rectFromWindow(windows.dock),
    panel: rectFromWindow(windows.panel),
    panelVisible: windows.panel.isVisible(),
    commandBar: commandBarVisible ? rectFromWindow(windows.commandBar) : null,
  });
  logGlassWindowDiagnostics(line);
}

function applyDockLayout(resetPosition = false): void {
  if (!windows?.dock || windows.dock.isDestroyed() || !layoutManager) return;
  const current = windows.dock.getBounds();
  const auto = layoutManager.getDockLayout(current.width, current.height);
  const workArea = layoutManager.getDisplay().workArea;
  let next = auto;
  if (resetPosition) {
    dockCustomOrigin = null;
    next = auto;
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

function applyCommandBarLayout(resetPosition = false): void {
  if (!windows?.commandBar || windows.commandBar.isDestroyed() || !layoutManager) return;
  const current = windows.commandBar.getBounds();
  const auto = layoutManager.getCommandBarLayout();
  const workArea = layoutManager.getDisplay().workArea;
  let next = auto;
  if (resetPosition) {
    commandBarCustomOrigin = null;
    next = auto;
  } else if (commandBarCustomOrigin) {
    next = resolveChromeWindowBounds(auto, commandBarCustomOrigin, workArea);
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
  windows.commandBar.setBounds(next);
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
  w.dock.on("moved", onMoved);
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
    if (overlayVisible) {
      applyOverlayClickThrough(windows.overlay, overlayClickThrough);
    }
  }

  if (!windows.panel.isDestroyed()) {
    windows.panel.setBounds(layoutManager.getPanelLayout());
  }

  if (!windows.commandBar.isDestroyed()) {
    applyCommandBarLayout(options?.resetDock ?? false);
  }

  applyDockLayout(options?.resetDock ?? false);

  ensureVisibleOnAllWorkspaces();
  stackGlassWindows(windows);
  logDiagnostics();
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
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  loadRenderer(overlay, "overlay.html");
  trackGlassWindow(overlay);
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
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  dock.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  loadRenderer(dock, "index.html");
  trackGlassWindow(dock);
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
  trackGlassWindow(panel);
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
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  commandBar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  loadRenderer(commandBar, "command.html");
  trackGlassWindow(commandBar);
  return commandBar;
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

  for (const win of [dock, panel, overlay, commandBar]) {
    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });
  }

  windows = { dock, panel, overlay, commandBar };

  wireChromeMoveListeners(windows);
  applyChromeMovability();

  if (!glassBootPending) {
    showPrimaryGlassWindows();
  } else {
    dock.hide();
    commandBar.hide();
    if (overlayVisible && overlayMode !== "hidden") overlay.hide();
  }

  wireWindowStacking(windows);
  ensureVisibleOnAllWorkspaces();
  stackGlassWindows(windows);
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
  splash.setIgnoreMouseEvents(true);
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
  if (!splash || splash.isDestroyed()) return;
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
  if (!splash.isDestroyed()) splash.close();
  glassBootPending = false;
  showPrimaryGlassWindows();
}

export function getWindows(): GlassWindows | null {
  return windows;
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
    overlay: isOverlayVisible() ? rectFromWindow(windows.overlay) : null,
    overlayVisible: isOverlayVisible(),
    overlayClickThrough,
    dock: rectFromWindow(windows.dock),
    panel: rectFromWindow(windows.panel),
    panelVisible: windows.panel.isVisible(),
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
  return overlayClickThrough;
}

export function getCommandBarClickThrough(): boolean {
  return commandBarClickThrough;
}

export function setOverlayClickThrough(enabled: boolean): void {
  if (!windows?.overlay || windows.overlay.isDestroyed() || !overlayVisible) return;
  applyOverlayClickThrough(windows.overlay, enabled);
}

export function setOverlayClickThroughFromWindow(win: BrowserWindow, enabled: boolean): void {
  if (!windows?.overlay || win.id !== windows.overlay.id) return;
  setOverlayClickThrough(enabled);
}

/**
 * Route a renderer's ignore-mouse request to the right window. The overlay is
 * full-screen click-through; the command bar toggles click-through so only the
 * floating pill captures clicks while the transparent margins pass through.
 */
export function setIgnoreMouseFromWindow(win: BrowserWindow, enabled: boolean): void {
  if (!windows) return;
  if (win.id === windows.overlay.id) {
    setOverlayClickThrough(enabled);
    return;
  }
  if (win.id === windows.commandBar.id && !windows.commandBar.isDestroyed()) {
    commandBarClickThrough = enabled;
    if (enabled) {
      windows.commandBar.setIgnoreMouseEvents(true, { forward: true });
    } else {
      windows.commandBar.setIgnoreMouseEvents(false);
    }
  }
}

export function toggleOverlay(): boolean {
  if (!windows?.overlay || windows.overlay.isDestroyed()) return false;
  if (overlayMode === "hidden") {
    overlayMode = "passive";
    overlayVisible = true;
  } else {
    overlayVisible = !overlayVisible;
  }
  if (overlayVisible) {
    if (layoutManager) {
      windows.overlay.setBounds(layoutManager.getOverlayLayout());
    }
    windows.overlay.showInactive();
    applyOverlayClickThrough(windows.overlay, true);
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
    windows.overlay.hide();
  } else if (!overlayVisible) {
    overlayVisible = true;
    if (layoutManager) {
      windows.overlay.setBounds(layoutManager.getOverlayLayout());
    }
    windows.overlay.showInactive();
    applyOverlayClickThrough(windows.overlay, true);
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
  let next: Electron.Rectangle = {
    x: current.x,
    y: current.y,
    width: clamped.width,
    height: clamped.height,
  };
  if (dockCustomOrigin) {
    const anchor = layoutManager.getDockLayout(clamped.width, clamped.height, options);
    next = resolveChromeWindowBounds(
      { ...anchor, width: clamped.width, height: clamped.height },
      dockCustomOrigin,
      layoutManager.getDisplay().workArea,
    );
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
  stackGlassWindows(windows);
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

export function blurCommandBar(): void {
  if (!windows?.commandBar || windows.commandBar.isDestroyed()) return;
  windows.commandBar.blur();
}

export function toggleCommandBar(): boolean {
  if (!windows?.commandBar || windows.commandBar.isDestroyed()) return commandBarVisible;
  commandBarVisible = !commandBarVisible;
  if (commandBarVisible) {
    if (layoutManager) {
      windows.commandBar.setBounds(layoutManager.getCommandBarLayout());
    }
    windows.commandBar.showInactive();
  } else {
    windows.commandBar.hide();
  }
  stackGlassWindows(windows);
  logDiagnostics();
  return commandBarVisible;
}

export function broadcast(channel: string, payload: unknown): void {
  if (!windows) return;
  for (const win of [windows.dock, windows.panel, windows.overlay, windows.commandBar]) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

export function disposeWindows(): void {
  stopFollowMouseTracking();
  destroyGlassWindows();
  layoutManager?.dispose();
  layoutManager = null;
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
  applyCommandBarClickThroughWhenLocked();
  return getChromeLayoutOrigins();
}

export function unlockChromeLayout(): void {
  chromeLayoutLocked = false;
  applyChromeMovability();
  if (windows?.commandBar && !windows.commandBar.isDestroyed()) {
    commandBarClickThrough = false;
    windows.commandBar.setIgnoreMouseEvents(false);
  }
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
  const workArea = layoutManager.getDisplay().workArea;
  const x = Math.max(
    workArea.x,
    Math.min(workArea.x + workArea.width - bounds.width, bounds.x + dx),
  );
  const y = Math.max(
    workArea.y,
    Math.min(workArea.y + workArea.height - bounds.height, bounds.y + dy),
  );
  if (x === bounds.x && y === bounds.y) return;

  win.setBounds({ x, y, width: bounds.width, height: bounds.height });
  captureChromeOriginsFromWindows();
  scheduleChromeLayoutPersist();
}

function applyCommandBarClickThroughWhenLocked(): void {
  if (!windows?.commandBar || windows.commandBar.isDestroyed() || !chromeLayoutLocked) return;
  commandBarClickThrough = true;
  windows.commandBar.setIgnoreMouseEvents(true, { forward: true });
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
