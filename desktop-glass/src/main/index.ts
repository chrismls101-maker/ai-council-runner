/**
 * IIVO Glass — Electron main process.
 *
 * Owns the canonical Glass state, handles user-initiated commands, talks to the
 * existing IIVO Context Bridge API, and hands off to the IIVO web app. Nothing
 * captures or sends without an explicit command from the UI.
 */

import { app, BrowserWindow, ipcMain, shell } from "electron";
import { resolveConfig, buildIivoChatUrl, buildLensAskUrl } from "../shared/config.ts";
import {
  privacyReducer,
  initialPrivacyState,
  type PrivacyState,
} from "../shared/privacyState.ts";
import { extractNotes, emptyNotes } from "../shared/noteExtraction.ts";
import { SavedMomentsStore } from "../shared/savedMoments.ts";
import {
  buildScreenshotContextPayload,
  buildTextContextPayload,
} from "../shared/contextPayload.ts";
import { createScreenshotContext, createContextItem } from "../shared/iivoClient.ts";
import { IPC, type GlassCommand, type GlassState } from "../shared/ipc.ts";
import type { PanelTab } from "../shared/types.ts";
import { capturePrimaryScreen } from "./capture.ts";
import {
  broadcast,
  createWindows,
  getWindows,
  togglePanel,
} from "./windows.ts";
import { loadMoments, persistMoments } from "./store.ts";

const config = resolveConfig(process.env);

interface AppState {
  privacy: PrivacyState;
  transcript: string;
  panelTab: PanelTab;
  lastError?: string;
  lastSentUrl?: string;
  pendingCaptureDataUrl?: string;
}

const state: AppState = {
  privacy: { ...initialPrivacyState },
  transcript: "",
  panelTab: "summary",
};

let moments = new SavedMomentsStore();

function snapshot(): GlassState {
  return {
    privacy: state.privacy,
    transcript: state.transcript,
    notes: state.transcript.trim() ? extractNotes(state.transcript) : emptyNotes(),
    moments: moments.list(),
    panelTab: state.panelTab,
    config,
    lastError: state.lastError,
    lastSentUrl: state.lastSentUrl,
  };
}

function push(): void {
  broadcast(IPC.state, snapshot());
}

function dispatchPrivacy(action: Parameters<typeof privacyReducer>[1]): void {
  state.privacy = privacyReducer(state.privacy, action);
}

async function openHandoff(contextId: string): Promise<void> {
  const url = buildLensAskUrl(config, contextId);
  state.lastSentUrl = url;
  await shell.openExternal(url);
}

async function handleCapture(): Promise<string | undefined> {
  state.lastError = undefined;
  dispatchPrivacy({ type: "CAPTURE_START", at: new Date().toISOString() });
  push();
  try {
    const result = await capturePrimaryScreen();
    state.pendingCaptureDataUrl = result.imageDataUrl;
    dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
    push();
    return result.imageDataUrl;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "Screen capture failed";
    dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
    push();
    return undefined;
  }
}

async function sendScreenshot(imageDataUrl: string): Promise<void> {
  state.lastError = undefined;
  dispatchPrivacy({ type: "SEND_START", at: new Date().toISOString() });
  push();
  try {
    const payload = buildScreenshotContextPayload({
      title: `IIVO Glass capture ${new Date().toLocaleString()}`,
    });
    const item = await createScreenshotContext(config, payload, imageDataUrl);
    moments.add({
      kind: "screenshot",
      note: "Screen capture sent to IIVO",
      contextId: item.id,
      sentToIivo: true,
    });
    await persistMoments(moments);
    await openHandoff(item.id);
    dispatchPrivacy({ type: "SEND_DONE", at: new Date().toISOString() });
    push();
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "Send to IIVO failed";
    dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
    push();
  }
}

async function sendTranscript(): Promise<void> {
  const text = state.transcript.trim();
  if (!text) {
    state.lastError = "No transcript text to send.";
    push();
    return;
  }
  state.lastError = undefined;
  dispatchPrivacy({ type: "SEND_START", at: new Date().toISOString() });
  push();
  try {
    const payload = buildTextContextPayload({
      title: `IIVO Glass transcript ${new Date().toLocaleString()}`,
      text,
      kind: "transcript",
    });
    const item = await createContextItem(config, payload);
    await openHandoff(item.id);
    dispatchPrivacy({ type: "SEND_DONE", at: new Date().toISOString() });
    push();
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "Send to IIVO failed";
    dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
    push();
  }
}

async function handleCommand(command: GlassCommand): Promise<void> {
  switch (command.type) {
    case "capture-screen":
      await handleCapture();
      return;
    case "start-listening":
      dispatchPrivacy({ type: "START_LISTENING", at: new Date().toISOString() });
      push();
      return;
    case "pause":
      dispatchPrivacy({ type: "PAUSE", at: new Date().toISOString() });
      push();
      return;
    case "stop":
      dispatchPrivacy({ type: "STOP", at: new Date().toISOString() });
      push();
      return;
    case "append-transcript":
      state.transcript = `${state.transcript}${state.transcript ? " " : ""}${command.text}`.trim();
      push();
      return;
    case "clear-transcript":
      state.transcript = "";
      push();
      return;
    case "save-moment": {
      const note =
        command.note?.trim() ||
        (state.transcript.trim()
          ? extractNotes(state.transcript).summary || "Saved transcript moment"
          : "Saved moment");
      moments.add({ kind: command.kind ?? "note", note });
      await persistMoments(moments);
      push();
      return;
    }
    case "delete-moment":
      moments.remove(command.id);
      await persistMoments(moments);
      push();
      return;
    case "clear-moments":
      moments.clear();
      await persistMoments(moments);
      push();
      return;
    case "send-screenshot": {
      const dataUrl = command.imageDataUrl ?? state.pendingCaptureDataUrl ?? (await handleCapture());
      if (dataUrl) await sendScreenshot(dataUrl);
      return;
    }
    case "send-transcript":
      await sendTranscript();
      return;
    case "send-moment": {
      const moment = moments.list().find((m) => m.id === command.id);
      if (moment?.contextId) {
        await openHandoff(moment.contextId);
        push();
      } else if (moment) {
        // Re-send the note text as fresh context.
        const payload = buildTextContextPayload({
          title: moment.sourceTitle ?? "IIVO Glass moment",
          text: moment.note,
          kind: "note",
        });
        const item = await createContextItem(config, payload);
        moments.markSent(moment.id, item.id);
        await persistMoments(moments);
        await openHandoff(item.id);
        push();
      }
      return;
    }
    case "ask-iivo":
      if (state.transcript.trim()) {
        await sendTranscript();
      } else {
        await shell.openExternal(buildIivoChatUrl(config));
      }
      return;
    case "open-chat":
      await shell.openExternal(buildIivoChatUrl(config));
      return;
    case "set-tab":
      state.panelTab = command.tab;
      push();
      return;
    case "toggle-panel":
      togglePanel();
      return;
    default:
      return;
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.getState, () => snapshot());

  ipcMain.on(IPC.command, (_event, command: GlassCommand) => {
    void handleCommand(command).catch((err) => {
      state.lastError = err instanceof Error ? err.message : String(err);
      push();
    });
  });

  ipcMain.on(IPC.setIgnoreMouse, (event, ignore: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.setIgnoreMouseEvents(ignore, { forward: true });
  });
}

app.whenReady().then(async () => {
  moments = await loadMoments();
  registerIpc();
  createWindows();
  push();

  app.on("activate", () => {
    if (getWindows() === null) {
      createWindows();
      push();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
