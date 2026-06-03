/**
 * IIVO Glass — Electron main process.
 *
 * Owns the canonical Glass state, handles user-initiated commands, talks to the
 * existing IIVO Context Bridge API, and hands off to the IIVO web app. Nothing
 * captures or sends without an explicit command from the UI.
 */

import { app, BrowserWindow, ipcMain, protocol, shell } from "electron";
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
import { IPC, type GlassCommand, type GlassState, type SessionActionStatus } from "../shared/ipc.ts";
import type { PanelTab } from "../shared/types.ts";
import { GlassSessionStore } from "../shared/sessionStore.ts";
import {
  extractSessionIntelligence,
  selectNewInsights,
} from "../shared/sessionIntelligence.ts";
import { buildSessionSummary } from "../shared/sessionSummary.ts";
import { buildSessionContextPayload } from "../shared/sessionPayload.ts";
import type { TranscriptionMode } from "../shared/transcriptionTypes.ts";
import { capturePrimaryScreen } from "./capture.ts";
import {
  broadcast,
  createWindows,
  getWindows,
  togglePanel,
} from "./windows.ts";
import { loadMoments, persistMoments } from "./store.ts";
import { loadSessions, persistSessions } from "./sessionPersistence.ts";
import {
  clearSessionScreenshotFolder,
  deleteScreenshotFiles,
  readScreenshotDataUrl,
  resolveThumbnailFilePath,
  saveSessionScreenshot,
} from "./sessionScreenshots.ts";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "glass-screenshot",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

const config = resolveConfig(process.env);

interface AppState {
  privacy: PrivacyState;
  transcript: string;
  panelTab: PanelTab;
  lastError?: string;
  lastNotice?: string;
  lastSentUrl?: string;
  pendingCaptureDataUrl?: string;
  sessionActionStatus: SessionActionStatus;
  transcriptionMode: TranscriptionMode;
}

const state: AppState = {
  privacy: { ...initialPrivacyState },
  transcript: "",
  panelTab: "summary",
  sessionActionStatus: "idle",
  transcriptionMode: "manual",
};

let moments = new SavedMomentsStore();
let sessions = new GlassSessionStore();

function sessionIsLive(): boolean {
  const s = sessions.current();
  return !!s && (s.status === "active" || s.status === "paused");
}

function snapshot(): GlassState {
  const session = sessions.current();
  return {
    privacy: state.privacy,
    transcript: state.transcript,
    notes: state.transcript.trim() ? extractNotes(state.transcript) : emptyNotes(),
    moments: moments.list(),
    panelTab: state.panelTab,
    config,
    lastError: state.lastError,
    lastNotice: state.lastNotice,
    lastSentUrl: state.lastSentUrl,
    session,
    sessionSummary: session ? buildSessionSummary(session) : "",
    sessionActionStatus: state.sessionActionStatus,
    transcriptionMode: state.transcriptionMode,
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
    case "add-transcript-chunk": {
      const chunk = command.text.trim();
      if (!chunk) return;
      state.transcript = `${state.transcript}${state.transcript ? " " : ""}${chunk}`.trim();
      if (sessionIsLive() && sessions.current()?.status === "active") {
        sessions.addEvent({
          kind: "transcript_note",
          title: chunk.length > 70 ? `${chunk.slice(0, 69)}…` : chunk,
          text: chunk,
        });
        await persistSessions(sessions);
      }
      push();
      return;
    }
    case "transcription-set-mode":
      state.transcriptionMode = command.mode;
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
      if (sessionIsLive()) {
        sessions.addEvent({ kind: "saved_moment", title: note });
        await persistSessions(sessions);
      }
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
      await handleSessionCommand(command);
      return;
  }
}

async function handleSessionCommand(command: GlassCommand): Promise<void> {
  state.lastNotice = undefined;
  switch (command.type) {
    case "session-start":
      sessions.startSession(command.title);
      state.lastNotice = "Session started — Glass is collecting events locally.";
      break;
    case "session-pause":
      sessions.pauseSession();
      break;
    case "session-resume":
      sessions.resumeSession();
      break;
    case "session-end":
      sessions.endSession();
      break;
    case "session-clear": {
      const session = sessions.current();
      if (session) await clearSessionScreenshotFolder(session.id);
      sessions.clearSession();
      break;
    }
    case "session-add-note": {
      const text = command.text.trim();
      if (!text) return;
      if (sessionIsLive()) {
        sessions.addEvent({
          kind: "manual_note",
          title: text.length > 70 ? `${text.slice(0, 69)}…` : text,
          text,
          sourceTitle: command.sourceTitle,
        });
      } else {
        moments.add({ kind: "note", note: text, sourceTitle: command.sourceTitle });
        await persistMoments(moments);
        state.lastNotice = "Saved as a moment. Start a session to keep notes in the timeline.";
      }
      break;
    }
    case "session-capture": {
      if (!sessionIsLive()) {
        state.lastNotice = "Start a session first to add captures to the timeline.";
        break;
      }
      const session = sessions.current();
      if (!session) break;
      state.lastError = undefined;
      dispatchPrivacy({ type: "CAPTURE_START", at: new Date().toISOString() });
      push();
      try {
        const result = await capturePrimaryScreen();
        const event = sessions.addEvent({
          kind: "screen_capture",
          title: `Screen capture (${result.width}×${result.height})`,
          sourceTitle: result.sourceName,
          importance: "medium",
        });
        if (event) {
          const refs = await saveSessionScreenshot(session.id, event.id, result.imageDataUrl);
          event.screenshotPath = refs.screenshotPath;
          event.thumbnailPath = refs.thumbnailPath;
          event.screenshotMimeType = refs.screenshotMimeType;
          event.screenshotSizeBytes = refs.screenshotSizeBytes;
          // Keep in-memory data URL for live send; stripped on persist.
          event.screenshotDataUrl = result.imageDataUrl;
        }
      } catch (err) {
        state.lastError = err instanceof Error ? err.message : "Screen capture failed";
      }
      dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
      break;
    }
    case "session-extract-insights": {
      const session = sessions.current();
      if (!session) {
        state.lastNotice = "No active session to analyze.";
        break;
      }
      const noteTexts = session.events
        .filter((e) => e.kind === "manual_note" || e.kind === "transcript_note")
        .map((e) => e.text ?? e.title);
      const candidates = extractSessionIntelligence({
        transcript: state.transcript,
        notes: noteTexts,
        events: session.events,
      });
      const fresh = selectNewInsights(session.insights, candidates);
      for (const c of fresh) {
        sessions.addInsight({
          type: c.type,
          title: c.title,
          text: c.text,
          sourceEventIds: c.sourceEventIds,
          importance: c.importance,
        });
      }
      state.lastNotice =
        fresh.length > 0
          ? `Extracted ${fresh.length} new insight${fresh.length === 1 ? "" : "s"}.`
          : "No new insights found.";
      break;
    }
    case "session-accept-insight":
      sessions.updateInsight(command.id, { accepted: true });
      break;
    case "session-dismiss-insight":
      sessions.deleteInsight(command.id);
      break;
    case "session-delete-event": {
      const session = sessions.current();
      const event = session?.events.find((e) => e.id === command.id);
      if (event) await deleteScreenshotFiles(event);
      sessions.deleteEvent(command.id);
      break;
    }
    case "session-save-insight-moment": {
      const insight = sessions.current()?.insights.find((i) => i.id === command.id);
      if (insight) {
        moments.add({ kind: "note", note: insight.text });
        await persistMoments(moments);
        if (sessionIsLive()) sessions.addEvent({ kind: "saved_moment", title: insight.text });
      }
      break;
    }
    case "session-send":
      await sendSession(false);
      break;
    case "session-analyze-council":
      await sendSession(true);
      break;
    case "session-send-event":
      await sendSessionEvent(command.id);
      break;
    case "session-send-insight": {
      const insight = sessions.current()?.insights.find((i) => i.id === command.id);
      if (insight) await sendSessionText(`IIVO Glass insight (${insight.type})`, insight.text);
      break;
    }
    case "session-send-summary": {
      const session = sessions.current();
      if (session) await sendSessionText(`IIVO Glass Session — ${session.title}`, buildSessionSummary(session));
      break;
    }
    default:
      break;
  }
  await persistSessions(sessions);
  push();
}

async function sendSession(forCouncilAnalysis: boolean): Promise<void> {
  const session = sessions.current();
  if (!session) {
    state.lastNotice = "No session to send.";
    return;
  }
  state.lastError = undefined;
  state.sessionActionStatus = "preparing";
  push();
  state.sessionActionStatus = "sending";
  dispatchPrivacy({ type: "SEND_START", at: new Date().toISOString() });
  push();
  try {
    const { payload, truncated, eventCount, insightCount } = buildSessionContextPayload(session, {
      forCouncilAnalysis,
    });
    const item = await createContextItem(config, payload);
    sessions.addEvent({
      kind: "iivo_sent",
      title: forCouncilAnalysis
        ? `Session analysis sent to IIVO (${eventCount} events, ${insightCount} insights)`
        : `Session sent to IIVO (${eventCount} events, ${insightCount} insights)`,
    });
    await openHandoff(item.id);
    state.sessionActionStatus = "opened";
    state.lastNotice = forCouncilAnalysis
      ? truncated
        ? "Session analysis opened in IIVO (timeline truncated)."
        : "Session analysis opened in IIVO."
      : truncated
        ? "Session sent to IIVO (timeline truncated for size)."
        : "Session sent to IIVO.";
    dispatchPrivacy({ type: "SEND_DONE", at: new Date().toISOString() });
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "Send session failed";
    state.sessionActionStatus = "failed";
    dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
  }
}

async function sendSessionEvent(id: string): Promise<void> {
  const event = sessions.current()?.events.find((e) => e.id === id);
  if (!event) return;
  state.lastError = undefined;
  dispatchPrivacy({ type: "SEND_START", at: new Date().toISOString() });
  push();
  try {
    const dataUrl =
      event.screenshotDataUrl ?? (await readScreenshotDataUrl(event));
    if (dataUrl) {
      const payload = buildScreenshotContextPayload({
        title: event.title,
        sourceTitle: event.sourceTitle,
      });
      const item = await createScreenshotContext(config, payload, dataUrl);
      await openHandoff(item.id);
    } else {
      const payload = buildTextContextPayload({
        title: event.title,
        text: event.text ?? event.title,
        kind: "note",
      });
      const item = await createContextItem(config, payload);
      await openHandoff(item.id);
    }
    dispatchPrivacy({ type: "SEND_DONE", at: new Date().toISOString() });
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "Send event failed";
    dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
  }
}

async function sendSessionText(title: string, text: string): Promise<void> {
  if (!text.trim()) return;
  state.lastError = undefined;
  dispatchPrivacy({ type: "SEND_START", at: new Date().toISOString() });
  push();
  try {
    const payload = buildTextContextPayload({ title, text, kind: "note" });
    const item = await createContextItem(config, payload);
    await openHandoff(item.id);
    dispatchPrivacy({ type: "SEND_DONE", at: new Date().toISOString() });
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "Send failed";
    dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
  }
}

function registerScreenshotProtocol(): void {
  protocol.registerFileProtocol("glass-screenshot", (request, callback) => {
    const urlPath = request.url.replace(/^glass-screenshot:\/\//, "");
    const filePath = resolveThumbnailFilePath(`/${urlPath}`);
    if (filePath) {
      callback({ path: filePath });
    } else {
      callback({ error: -6 }); // FILE_NOT_FOUND
    }
  });
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
  registerScreenshotProtocol();
  moments = await loadMoments();
  sessions = await loadSessions();
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
