/**
 * Glass Settings — standalone settings window (full-width, same band as Glass Dashboard).
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app, ipcMain, shell } from "electron";
import { IPC } from "../shared/ipc.ts";
import type { GlassSettingsSection } from "../shared/panelTabRouting.ts";
import { getSettingsLayoutBounds } from "./windows.ts";

const isDev = !!process.env.ELECTRON_RENDERER_URL;
const mainDir = dirname(fileURLToPath(import.meta.url));
const preloadPath = join(mainDir, "../preload/index.mjs");

/** Above overlay + dock/command bar so settings stays visible over the dashboard. */
const SETTINGS_ALWAYS_ON_TOP_RELATIVE = 18;

let settingsWindow: BrowserWindow | null = null;
let settingsIpcRegistered = false;
let pendingSettingsSection: GlassSettingsSection | undefined;

export function takePendingSettingsSection(): GlassSettingsSection | undefined {
  const section = pendingSettingsSection;
  pendingSettingsSection = undefined;
  return section;
}

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

function resolveSettingsBounds(): Electron.Rectangle {
  const layout = getSettingsLayoutBounds();
  if (layout) return { ...layout };
  return { x: 0, y: 0, width: 1280, height: 800 };
}

function registerSettingsIpc(): void {
  if (settingsIpcRegistered) return;
  settingsIpcRegistered = true;

  ipcMain.on(IPC.openGlassSettings, (_event, section: unknown) => {
    const validSections: GlassSettingsSection[] = [
      "providers",
      "context",
      "audio",
      "components",
      "account",
      "dev",
      "shortcuts",
      "about",
    ];
    pendingSettingsSection =
      typeof section === "string" && validSections.includes(section as GlassSettingsSection)
        ? (section as GlassSettingsSection)
        : undefined;
    showGlassSettings();
  });

  ipcMain.handle(IPC.getSettingsInitialSection, (event) => {
    if (!isSettingsIpcSender(event.sender)) return "providers" as GlassSettingsSection;
    return takePendingSettingsSection() ?? ("providers" as GlassSettingsSection);
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
  const bounds = resolveSettingsBounds();
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: true,
    minWidth: 720,
    minHeight: 480,
    movable: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

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

export function syncGlassSettingsLayout(): void {
  if (!settingsWindow || settingsWindow.isDestroyed()) return;
  settingsWindow.setBounds(resolveSettingsBounds());
}

export function showGlassSettings(section?: GlassSettingsSection): void {
  if (section) {
    pendingSettingsSection = section;
  }
  registerSettingsIpc();
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    syncGlassSettingsLayout();
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
