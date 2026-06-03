/**
 * Window management for IIVO Glass.
 *
 * v1 uses two small, always-on-top, transparent, frameless windows instead of a
 * single full-screen overlay. This is the robust approach called out in the
 * spec: there is no full-screen click-blocking layer, so the underlying screen
 * stays fully clickable. Only the dock and the side panel capture mouse events.
 */

import { join } from "node:path";
import { BrowserWindow, screen, shell } from "electron";

const isDev = !!process.env.ELECTRON_RENDERER_URL;
const preloadPath = join(__dirname, "../preload/index.mjs");

interface GlassWindows {
  dock: BrowserWindow;
  panel: BrowserWindow;
}

let windows: GlassWindows | null = null;

function loadRenderer(win: BrowserWindow, htmlFile: "index.html" | "panel.html"): void {
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${htmlFile}`);
  } else {
    void win.loadFile(join(__dirname, `../renderer/${htmlFile}`));
  }
}

function createDockWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 480;
  const height = 96;
  const dock = new BrowserWindow({
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: workArea.y + 24,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  dock.setAlwaysOnTop(true, "screen-saver");
  dock.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  loadRenderer(dock, "index.html");
  return dock;
}

function createPanelWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 400;
  const height = 620;
  const panel = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + 140,
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
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  panel.setAlwaysOnTop(true, "screen-saver");
  panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  loadRenderer(panel, "panel.html");
  return panel;
}

export function createWindows(): GlassWindows {
  const dock = createDockWindow();
  const panel = createPanelWindow();

  // Open external IIVO handoff links in the user's real browser, never inside
  // an overlay window.
  for (const win of [dock, panel]) {
    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });
  }

  windows = { dock, panel };
  return windows;
}

export function getWindows(): GlassWindows | null {
  return windows;
}

export function togglePanel(): boolean {
  if (!windows) return false;
  const { panel } = windows;
  if (panel.isVisible()) {
    panel.hide();
    return false;
  }
  panel.show();
  return true;
}

export function broadcast(channel: string, payload: unknown): void {
  if (!windows) return;
  for (const win of [windows.dock, windows.panel]) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}
