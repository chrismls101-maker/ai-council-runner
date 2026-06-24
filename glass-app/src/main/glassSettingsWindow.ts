/**
 * Glass Settings — standalone settings window.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app, ipcMain, screen, shell } from "electron";
import { IPC } from "../shared/ipc.ts";

const isDev = !!process.env.ELECTRON_RENDERER_URL;
const mainDir = dirname(fileURLToPath(import.meta.url));
const preloadPath = join(mainDir, "../preload/index.mjs");

const SETTINGS_WIDTH = 640;
const SETTINGS_HEIGHT = 520;
/** Above overlay + dock/command bar so settings stays visible over the dashboard. */
const SETTINGS_ALWAYS_ON_TOP_RELATIVE = 18;

let settingsWindow: BrowserWindow | null = null;
let settingsIpcRegistered = false;

function loadSettingsRenderer(win: BrowserWindow): void {
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/settings.html`);
  } else {
    void win.loadFile(join(mainDir, "../renderer/settings.html"));
  }
}

export function isSettingsIpcSender(sender: Electron.WebContents): boolean {
  if (!settingsWindow || settingsWindow.isDestroyed()) return false;
  return sender.id === settingsWindow.webContents.id;
}

function centerSettingsBounds(): Electron.Rectangle {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: area.x + Math.round((area.width - SETTINGS_WIDTH) / 2),
    y: area.y + Math.round((area.height - SETTINGS_HEIGHT) / 2),
    width: SETTINGS_WIDTH,
    height: SETTINGS_HEIGHT,
  };
}

function registerSettingsIpc(): void {
  if (settingsIpcRegistered) return;
  settingsIpcRegistered = true;

  ipcMain.on(IPC.openGlassSettings, () => {
    showGlassSettings();
  });

  ipcMain.on(IPC.closeGlassSettings, (event) => {
    if (!isSettingsIpcSender(event.sender)) return;
    closeGlassSettingsWindow();
  });

  ipcMain.handle(IPC.getAppVersion, (event) => {
    if (!isSettingsIpcSender(event.sender)) return "—";
    return app.getVersion();
  });

  ipcMain.handle(IPC.settingsOpenExternal, (event, rawUrl: unknown) => {
    if (!isSettingsIpcSender(event.sender)) return { ok: false };
    if (typeof rawUrl !== "string" || !rawUrl.trim()) return { ok: false };
    const url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) return { ok: false };
    void shell.openExternal(url);
    return { ok: true };
  });
}

function raiseGlassSettingsWindow(win: BrowserWindow): void {
  win.setAlwaysOnTop(true, "screen-saver", SETTINGS_ALWAYS_ON_TOP_RELATIVE);
  if (!win.isVisible()) win.show();
  win.focus();
}

function createGlassSettingsWindow(): BrowserWindow {
  const bounds = centerSettingsBounds();
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    resizable: false,
    transparent: false,
    show: false,
    alwaysOnTop: true,
    backgroundColor: "#0c0c10",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.platform === "darwin") {
    win.setVibrancy("under-window");
  }

  raiseGlassSettingsWindow(win);

  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) raiseGlassSettingsWindow(win);
  });

  win.on("closed", () => {
    settingsWindow = null;
  });

  loadSettingsRenderer(win);
  settingsWindow = win;
  return win;
}

export function showGlassSettings(): void {
  registerSettingsIpc();
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    raiseGlassSettingsWindow(settingsWindow);
    return;
  }
  createGlassSettingsWindow();
}

export function closeGlassSettingsWindow(): void {
  if (!settingsWindow || settingsWindow.isDestroyed()) return;
  settingsWindow.close();
  settingsWindow = null;
}

export function initGlassSettings(): void {
  registerSettingsIpc();
}

export function teardownGlassSettings(): void {
  closeGlassSettingsWindow();
}
