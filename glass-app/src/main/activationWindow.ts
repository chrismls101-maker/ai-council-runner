/**
 * Activation window — Anthropic key gate + compact Aletheia key-wait rail.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app, ipcMain, screen, shell } from "electron";
import {
  hasStoredAnthropicKey,
  resolveAnthropicApiKey,
} from "./anthropicKeyStore.ts";
import { connectAnthropicApiKey } from "./connectAnthropicApiKey.ts";
import { fetchElevenLabsTtsBuffer } from "./glassElevenLabsTts.ts";
import { setActivationPending } from "./windows.ts";
import { answerActivationHelp } from "../shared/activationHelp.ts";
import {
  IPC,
  type ActivationAskHelpResponse,
  type ActivationConnectResponse,
  type ActivationPresentation,
  type ActivationSpeakResponse,
} from "../shared/ipc.ts";

const isDev = !!process.env.ELECTRON_RENDERER_URL;
const mainDir = dirname(fileURLToPath(import.meta.url));
const preloadPath = join(mainDir, "../preload/index.mjs");

const KEY_WAIT_WIDTH = 392;
const KEY_WAIT_HEIGHT = 580;
const KEY_WAIT_MARGIN = 20;

let activationWindow: BrowserWindow | null = null;
let activationResolve: ((result: "connected" | "quit") => void) | null = null;
let activationIpcRegistered = false;
let activationPresentation: ActivationPresentation = "form";

function activationWorkArea(): Electron.Rectangle {
  return screen.getPrimaryDisplay().workArea;
}

function activationFormBounds(): Electron.Rectangle {
  return activationWorkArea();
}

function activationKeyWaitBounds(): Electron.Rectangle {
  const area = activationWorkArea();
  return {
    x: area.x + area.width - KEY_WAIT_WIDTH - KEY_WAIT_MARGIN,
    y: area.y + Math.round((area.height - KEY_WAIT_HEIGHT) / 2),
    width: KEY_WAIT_WIDTH,
    height: KEY_WAIT_HEIGHT,
  };
}

function loadActivationRenderer(win: BrowserWindow): void {
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/activation.html`);
  } else {
    void win.loadFile(join(mainDir, "../renderer/activation.html"));
  }
}

export function isActivationIpcSender(sender: Electron.WebContents): boolean {
  if (!activationWindow || activationWindow.isDestroyed()) return false;
  return sender.id === activationWindow.webContents.id;
}

function applyActivationPresentation(win: BrowserWindow, mode: ActivationPresentation): void {
  activationPresentation = mode;
  if (mode === "key-wait") {
    win.setBounds(activationKeyWaitBounds());
    win.setAlwaysOnTop(true, "floating", 0);
    win.setMinimizable(true);
  } else {
    win.setBounds(activationFormBounds());
    win.setAlwaysOnTop(true, "screen-saver", 1);
    win.setMinimizable(true);
  }
}

function registerActivationIpc(): void {
  if (activationIpcRegistered) return;
  activationIpcRegistered = true;

  ipcMain.handle(
    IPC.activationConnect,
    async (event, rawKey: unknown): Promise<ActivationConnectResponse> => {
      if (!isActivationIpcSender(event.sender)) {
        return { ok: false, error: "Unauthorized" };
      }
      const result = await connectAnthropicApiKey(rawKey);
      if (result.ok) closeActivationWindow("connected");
      return result;
    },
  );

  ipcMain.handle(IPC.activationOpenKeysUrl, (event) => {
    if (!isActivationIpcSender(event.sender)) return { ok: false };
    void shell.openExternal("https://console.anthropic.com/account/keys");
    return { ok: true };
  });

  ipcMain.handle(IPC.activationQuit, (event) => {
    if (!isActivationIpcSender(event.sender)) return { ok: false };
    closeActivationWindow("quit");
    return { ok: true };
  });

  ipcMain.handle(
    IPC.activationSetPresentation,
    (event, mode: unknown): { ok: boolean; presentation?: ActivationPresentation } => {
      if (!isActivationIpcSender(event.sender)) return { ok: false };
      if (mode !== "form" && mode !== "key-wait") return { ok: false };
      if (!activationWindow || activationWindow.isDestroyed()) return { ok: false };
      applyActivationPresentation(activationWindow, mode);
      return { ok: true, presentation: mode };
    },
  );

  ipcMain.handle(
    IPC.activationSpeak,
    async (event, rawText: unknown): Promise<ActivationSpeakResponse> => {
      if (!isActivationIpcSender(event.sender)) return { ok: false };
      if (typeof rawText !== "string" || !rawText.trim()) return { ok: false };
      try {
        const buf = await fetchElevenLabsTtsBuffer(rawText.trim().slice(0, 2000), "en");
        if (!buf) return { ok: false };
        return { ok: true, data: buf.toString("base64") };
      } catch {
        return { ok: false };
      }
    },
  );

  ipcMain.handle(
    IPC.activationAskHelp,
    (event, rawQuestion: unknown): ActivationAskHelpResponse => {
      if (!isActivationIpcSender(event.sender)) return { ok: false, answer: "" };
      const question = typeof rawQuestion === "string" ? rawQuestion : "";
      return { ok: true, answer: answerActivationHelp(question) };
    },
  );
}

function closeActivationWindow(result: "connected" | "quit"): void {
  const resolve = activationResolve;
  activationResolve = null;
  activationPresentation = "form";
  setActivationPending(false);
  if (activationWindow && !activationWindow.isDestroyed()) {
    activationWindow.removeAllListeners("close");
    activationWindow.close();
  }
  activationWindow = null;
  resolve?.(result);
}

function applyActivationBounds(win: BrowserWindow): void {
  applyActivationPresentation(win, activationPresentation);
}

export function createActivationWindow(): BrowserWindow {
  registerActivationIpc();
  setActivationPending(true);
  activationPresentation = "form";

  if (activationWindow && !activationWindow.isDestroyed()) {
    applyActivationBounds(activationWindow);
    activationWindow.focus();
    return activationWindow;
  }

  const { x, y, width, height } = activationFormBounds();

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver", 1);
  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) win.show();
  });

  win.on("close", (event) => {
    if (resolveAnthropicApiKey() || hasStoredAnthropicKey()) return;
    event.preventDefault();
    closeActivationWindow("quit");
  });

  loadActivationRenderer(win);
  activationWindow = win;
  return win;
}

/** Block until the user connects a key or closes the window (quits app). */
export function waitForActivationWindow(): Promise<"connected" | "quit"> {
  if (resolveAnthropicApiKey()) return Promise.resolve("connected");
  if (process.env.IIVO_GLASS_E2E === "1") return Promise.resolve("connected");

  return new Promise((resolve) => {
    activationResolve = resolve;
    createActivationWindow();
  });
}

/** Show activation when no Anthropic key is configured. Returns false if the user quit. */
export async function ensureAnthropicKeyActivated(): Promise<boolean> {
  if (resolveAnthropicApiKey()) return true;
  if (process.env.IIVO_GLASS_E2E === "1") return true;
  const result = await waitForActivationWindow();
  if (result === "quit") {
    app.quit();
    return false;
  }
  return true;
}

export function closeActivationWindowIfOpen(): void {
  if (!activationWindow || activationWindow.isDestroyed()) return;
  activationWindow.removeAllListeners("close");
  activationWindow.close();
  activationWindow = null;
  activationPresentation = "form";
  setActivationPending(false);
}

/** Dev / preview — show activation UI without blocking boot or requiring key removal. */
export function openActivationWindowDev(): void {
  const win = createActivationWindow();
  win.removeAllListeners("close");
  win.on("close", () => {
    activationWindow = null;
    activationPresentation = "form";
    setActivationPending(false);
  });
}
