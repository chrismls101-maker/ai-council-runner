/**
 * IIVO Glass — three-layer window architecture:
 * 1. Full-screen overlay (display.bounds, click-through by default)
 * 2. Compact dock (workArea, clickable)
 * 3. Optional side panel (workArea, clickable when open)
 */

import { join } from "node:path";
import { BrowserWindow, shell } from "electron";
import type { GlassConfig } from "../shared/config.ts";
import type { OverlayMode } from "../shared/glassWindowTypes.ts";
import { GlassLayoutManager } from "./glassLayoutManager.ts";
import {
  buildWindowState,
  formatGlassWindowDiagnostics,
  logGlassWindowDiagnostics,
  rectFromWindow,
} from "./glassWindowDiagnostics.ts";

const isDev = !!process.env.ELECTRON_RENDERER_URL;
const preloadPath = join(__dirname, "../preload/index.mjs");

type RendererPage = "index.html" | "panel.html" | "overlay.html";

export interface GlassWindows {
  dock: BrowserWindow;
  panel: BrowserWindow;
  overlay: BrowserWindow;
}

let windows: GlassWindows | null = null;
let layoutManager: GlassLayoutManager | null = null;
let overlayVisible = true;
let overlayClickThrough = true;
let overlayMode: OverlayMode = "passive";

function loadRenderer(win: BrowserWindow, htmlFile: RendererPage): void {
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${htmlFile}`);
  } else {
    void win.loadFile(join(__dirname, `../renderer/${htmlFile}`));
  }
}

/** Overlay above desktop apps; dock/panel stack above overlay via relativeLevel. */
const OVERLAY_ALWAYS_ON_TOP_LEVEL = "screen-saver" as const;
const OVERLAY_ALWAYS_ON_TOP_RELATIVE = 0;
const DOCK_ALWAYS_ON_TOP_RELATIVE = 1;
const PANEL_ALWAYS_ON_TOP_RELATIVE = 2;

function applyOverlayClickThrough(overlay: BrowserWindow, enabled: boolean): void {
  overlayClickThrough = enabled;
  if (enabled) {
    overlay.setIgnoreMouseEvents(true, { forward: true });
  } else {
    overlay.setIgnoreMouseEvents(false);
  }
}

/** Overlay above desktop apps; dock/panel stack above overlay via relativeLevel. */
export function stackGlassWindows(w: GlassWindows): void {
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
  });
  logGlassWindowDiagnostics(line);
}

function relayoutAllWindows(): void {
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

  if (!windows.dock.isDestroyed()) {
    const current = windows.dock.getBounds();
    windows.dock.setBounds(
      layoutManager.repositionDock(current, current.width, current.height),
    );
  }

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
  return panel;
}

export function createWindows(glassConfig: GlassConfig): GlassWindows {
  layoutManager?.dispose();
  layoutManager = new GlassLayoutManager(glassConfig.layoutPreset);
  layoutManager.onDisplayChanged(() => relayoutAllWindows());

  overlayVisible = glassConfig.overlayEnabled;
  overlayMode = glassConfig.overlayMode;
  overlayClickThrough = true;

  const overlay = createOverlayWindow();
  const dock = createDockWindow();
  const panel = createPanelWindow();

  for (const win of [dock, panel, overlay]) {
    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });
  }

  windows = { dock, panel, overlay };

  if (overlayVisible && overlayMode !== "hidden") {
    overlay.setBounds(layoutManager.getOverlayLayout());
    overlay.showInactive();
    applyOverlayClickThrough(overlay, true);
  }

  wireWindowStacking(windows);
  stackGlassWindows(windows);
  logDiagnostics();
  return windows;
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
    return buildWindowState("Glass windows: not initialized", false, true, overlayMode, false);
  }
  const diagnostics = formatGlassWindowDiagnostics({
    display: layoutManager.getDisplay(),
    overlay: isOverlayVisible() ? rectFromWindow(windows.overlay) : null,
    overlayVisible: isOverlayVisible(),
    overlayClickThrough,
    dock: rectFromWindow(windows.dock),
    panel: rectFromWindow(windows.panel),
    panelVisible: windows.panel.isVisible(),
  });
  return buildWindowState(
    diagnostics,
    isOverlayVisible(),
    overlayClickThrough,
    overlayMode,
    windows.panel.isVisible(),
  );
}

export function setOverlayClickThrough(enabled: boolean): void {
  if (!windows?.overlay || windows.overlay.isDestroyed() || !overlayVisible) return;
  applyOverlayClickThrough(windows.overlay, enabled);
}

export function setOverlayClickThroughFromWindow(win: BrowserWindow, enabled: boolean): void {
  if (!windows?.overlay || win.id !== windows.overlay.id) return;
  setOverlayClickThrough(enabled);
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

export function resizeDockWindow(width: number, height: number): void {
  if (!windows?.dock || windows.dock.isDestroyed() || !layoutManager) return;
  const next = layoutManager.repositionDock(windows.dock.getBounds(), width, height);
  const current = windows.dock.getBounds();
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

export function broadcast(channel: string, payload: unknown): void {
  if (!windows) return;
  for (const win of [windows.dock, windows.panel, windows.overlay]) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

export function disposeWindows(): void {
  layoutManager?.dispose();
  layoutManager = null;
  windows = null;
}
