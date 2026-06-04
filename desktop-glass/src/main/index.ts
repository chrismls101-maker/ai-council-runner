/**
 * IIVO Glass — Electron main process.
 *
 * Owns the canonical Glass state, handles user-initiated commands, talks to the
 * existing IIVO Context Bridge API, and hands off to the IIVO web app. Nothing
 * captures or sends without an explicit command from the UI.
 */

import { loadGlassEnv } from "./loadGlassEnv.ts";
import { installGlassE2eHooks, getE2eExternalUrls, resetE2eExternalUrls } from "./e2eMainHooks.ts";
import { getGlassE2eWindowMetadata } from "./e2eWindowMetadata.ts";
import { app, BrowserWindow, ipcMain, protocol, shell } from "electron";
import { resolveConfig, buildIivoChatUrl, buildLensAskUrl, buildRunHistoryUrl } from "../shared/config.ts";
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
import { waitForMinThinkingDuration } from "../shared/glassAskTiming.ts";
import type { PanelTab } from "../shared/types.ts";
import { GlassSessionStore } from "../shared/sessionStore.ts";
import {
  extractSessionIntelligence,
  selectNewInsights,
} from "../shared/sessionIntelligence.ts";
import { buildSessionSummary } from "../shared/sessionSummary.ts";
import { buildSessionContextPayload } from "../shared/sessionPayload.ts";
import type { TranscriptionMode } from "../shared/audioCaptureTypes.ts";
import type { IivoAnalysisState } from "../shared/ipc.ts";
import {
  mergeCaptureSource,
  windowContextForEvent,
  WINDOW_CONTEXT_UNAVAILABLE_MESSAGE,
  type WindowContext,
} from "../shared/windowContextTypes.ts";
import {
  buildAnalysisFailureNotice,
  buildCouncilRunRequest,
  buildSessionAnalysisPrompt,
  estimateCouncilCredits,
  runCouncilAnalysis,
} from "../shared/iivoAnalysisClient.ts";
import { captureDisplayById } from "./capture.ts";
import {
  resolveCaptureDisplay,
  sanitizeDisplayTarget,
} from "./displayRegistry.ts";
import {
  blurCommandBar,
  broadcast,
  createWindows,
  getCommandBarHotkeyStatus,
  applyGlassUserSettings,
  getAvailableDisplayIds,
  getConnectedDisplays,
  getDisplayLayoutSummary,
  refreshGlassDisplayLayout,
  getGlassWindowState,
  getWindows,
  isPanelVisible,
  registerCommandBarHotkeys,
  resizeDockWindow,
  setIgnoreMouseFromWindow,
  setOverlayClickThrough,
  setOverlayMode,
  toggleCommandBar,
  toggleOverlay,
  togglePanel,
  unregisterCommandBarHotkeys,
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
import {
  getCachedWindowContext,
  getCurrentWindowContext,
  refreshWindowContext,
} from "./windowContext.ts";
import {
  applySystemAudioChromiumFlags,
  registerSystemAudioHandler,
} from "./systemAudioHandler.ts";
import { release } from "node:os";
import { resolveInitialSystemAudioStatus, darwinMajorFromRelease } from "../shared/systemAudioCapture.ts";
import type { SystemAudioStatus } from "../shared/systemAudioTypes.ts";
import { buildGlassSttState, resolveSttConfig } from "../shared/sttTypes.ts";
import { listeningCostWarningMessage } from "../shared/audioChunks.ts";
import { processSttChunk, type SttProcessChunkPayload } from "./sttChunkHandler.ts";
import type { GlassSttState } from "../shared/ipc.ts";
import {
  CAPTURE_NO_SESSION_HINT,
  CAPTURE_SESSION_SUCCESS_MESSAGE,
  CAPTURE_SUCCESS_MESSAGE,
  captureErrorMessage,
  createInitialOperationDiagnostics,
  diagnosticsForCapture,
  diagnosticsForListening,
  recordOperation,
  type GlassOperationDiagnostics,
} from "../shared/glassOperations.ts";
import {
  broadcastTranscriptionControl,
  stopAllActiveCaptureAndListening,
} from "./glassOperations.ts";
import {
  appendCommandFeedItem,
  createCommandFeedItem,
  type GlassCommandFeedItem,
} from "../shared/commandFeed.ts";
import { askIivoGlass, GlassAskCancelledError } from "./glassAskClient.ts";
import type { GlassAskSessionPayload, GlassAskStatus, GlassLastAskResponse } from "../shared/glassAskTypes.ts";
import {
  DEFAULT_GLASS_USER_SETTINGS,
  type GlassUserSettings,
} from "../shared/glassSettings.ts";
import { loadGlassUserSettings, persistGlassUserSettings } from "./glassSettingsPersistence.ts";

loadGlassEnv();
installGlassE2eHooks();

if (process.env.IIVO_GLASS_E2E === "1") {
  app.commandLine.appendSwitch("remote-debugging-port", "19222");
}

applySystemAudioChromiumFlags();

const defaultWindowContext: WindowContext = {
  status: "unavailable",
  reason: WINDOW_CONTEXT_UNAVAILABLE_MESSAGE,
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: "glass-screenshot",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

const config = resolveConfig(process.env);
const sttConfig = resolveSttConfig(process.env);

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
  systemAudioStatus: SystemAudioStatus;
  systemAudioDetail?: string;
  windowContext: WindowContext;
  iivoAnalysis: IivoAnalysisState;
  stt: GlassSttState;
  operationDiagnostics: GlassOperationDiagnostics;
  commandFeed: GlassCommandFeedItem[];
  askStatus: GlassAskStatus;
  lastAskResponse?: GlassLastAskResponse;
  askInFlight: boolean;
  glassSettings: GlassUserSettings;
}

let askAbortController: AbortController | null = null;
let askRequestGeneration = 0;
let thinkingStartedAtMs: number | null = null;
let glassUserSettings: GlassUserSettings = { ...DEFAULT_GLASS_USER_SETTINGS };

const state: AppState = {
  privacy: { ...initialPrivacyState },
  transcript: "",
  panelTab: "summary",
  sessionActionStatus: "idle",
  transcriptionMode: "manual",
  systemAudioStatus: resolveInitialSystemAudioStatus(
    process.platform,
    darwinMajorFromRelease(release()),
  ),
  windowContext: defaultWindowContext,
  iivoAnalysis: { status: "idle" },
  stt: buildGlassSttState(sttConfig),
  operationDiagnostics: createInitialOperationDiagnostics(),
  commandFeed: [],
  askStatus: "idle",
  askInFlight: false,
  glassSettings: { ...DEFAULT_GLASS_USER_SETTINGS },
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
    systemAudioStatus: state.systemAudioStatus,
    systemAudioDetail: state.systemAudioDetail,
    windowContext: state.windowContext,
    iivoAnalysis: state.iivoAnalysis,
    stt: state.stt,
    panelVisible: isPanelVisible(),
    windows: getGlassWindowState(),
    operationDiagnostics: {
      ...state.operationDiagnostics,
      hotkeyStatus: getCommandBarHotkeyStatus(),
      displayInfo: getDisplayLayoutSummary(),
    },
    commandFeed: state.commandFeed,
    askStatus: state.askStatus,
    lastAskResponse: state.lastAskResponse,
    glassSettings: state.glassSettings,
    availableDisplayIds: getAvailableDisplayIds(),
    connectedDisplays: getConnectedDisplays(),
  };
}

function pushFeed(item: GlassCommandFeedItem): void {
  state.commandFeed = appendCommandFeedItem(state.commandFeed, item);
}

function eventContextFields(opts?: { sourceTitle?: string; captureSource?: string }) {
  let ctx = getCachedWindowContext();
  if (opts?.captureSource) ctx = mergeCaptureSource(ctx, opts.captureSource);
  const mapped = windowContextForEvent(ctx);
  return {
    sourceApp: mapped.sourceApp,
    sourceTitle: opts?.sourceTitle ?? mapped.sourceTitle,
    metadata: mapped.metadata,
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
  const captureTarget = resolveCaptureDisplay(state.glassSettings.displayTarget);
  state.operationDiagnostics = {
    ...recordOperation(state.operationDiagnostics, "capture-screen", "pending"),
    captureStatus: `Capturing ${captureTarget.label}`,
  };
  dispatchPrivacy({ type: "CAPTURE_START", at: new Date().toISOString() });
  push();
  try {
    const result = await captureDisplayById(captureTarget.id, captureTarget.label);
    state.pendingCaptureDataUrl = result.imageDataUrl;
    state.lastNotice = `${CAPTURE_SUCCESS_MESSAGE} (${result.displayLabel})`;
    state.operationDiagnostics = diagnosticsForCapture(
      state.operationDiagnostics,
      true,
      undefined,
      result.displayLabel,
    );
    dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
    push();
    return result.imageDataUrl;
  } catch (err) {
    const message = captureErrorMessage(err);
    state.lastError = message;
    state.lastNotice = undefined;
    state.operationDiagnostics = diagnosticsForCapture(state.operationDiagnostics, false, message);
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

function buildGlassAskSessionPayload(): GlassAskSessionPayload | undefined {
  const session = sessions.current();
  const live = sessionIsLive();
  const ctx = getCachedWindowContext();

  const payload: GlassAskSessionPayload = {
    sessionId: session?.id,
    title: session?.title,
    summary: live && session ? buildSessionSummary(session) : undefined,
    recentTranscript: state.transcript.trim() ? state.transcript.trim().slice(-1500) : undefined,
    currentSource:
      ctx.status === "available"
        ? {
            appName: ctx.appName,
            windowTitle: ctx.windowTitle,
            sourceTitle: ctx.sourceName ?? ctx.displayName,
          }
        : ctx.sourceName
          ? { sourceTitle: ctx.sourceName }
          : undefined,
  };

  if (live && session) {
    payload.recentEvents = session.events.slice(-8).map((e) => ({
      kind: e.kind,
      title: e.title,
      text: e.text,
      timestamp: e.timestamp,
      sourceTitle: e.sourceTitle,
    }));
    payload.recentInsights = session.insights.slice(-5).map((i) => i.text);
  }

  const hasContext =
    payload.summary ||
    payload.recentTranscript ||
    payload.recentEvents?.length ||
    payload.recentInsights?.length ||
    payload.currentSource;
  return hasContext ? payload : undefined;
}

async function openFeedInIivo(feedId: string): Promise<void> {
  const item = state.commandFeed.find((f) => f.id === feedId);
  if (!item) return;

  if (item.runId) {
    const runUrl = buildRunHistoryUrl(config, item.runId);
    state.lastSentUrl = runUrl;
    await shell.openExternal(runUrl);
    state.lastNotice = "Opened run in IIVO.";
    push();
    return;
  }

  if (item.contextId) {
    await openHandoff(item.contextId);
    state.lastNotice = "Opened in IIVO with this answer attached.";
    push();
    return;
  }

  const question = item.prompt ?? item.title;
  const answer = item.fullBody ?? (item.kind === "response" ? item.body : undefined);
  const session = sessions.current();
  const summary = session ? buildSessionSummary(session) : undefined;
  const parts = [`Question:\n${question}`];
  if (answer) parts.push(`Answer:\n${answer}`);
  if (summary?.trim()) parts.push(`Session context:\n${summary.trim()}`);
  const text =
    parts.length > 1
      ? parts.join("\n\n")
      : `Question:\n${question}\n\n(Continue this conversation in IIVO.)`;
  const payload = buildTextContextPayload({
    title: `IIVO Glass · ${question.length > 60 ? `${question.slice(0, 59)}…` : question}`,
    text,
    kind: "note",
  });
  const created = await createContextItem(config, payload);
  await openHandoff(created.id);
  state.lastNotice = "Opened in IIVO with this answer attached.";
  push();
}

function removeThinkingFeedItems(): void {
  state.commandFeed = state.commandFeed.filter((item) => item.kind !== "thinking");
}

function cancelGlassAsk(): void {
  if (!state.askInFlight) return;

  askRequestGeneration += 1;
  askAbortController?.abort();
  askAbortController = null;
  thinkingStartedAtMs = null;
  state.askInFlight = false;
  state.askStatus = "idle";
  removeThinkingFeedItems();
  pushFeed(createCommandFeedItem("error", "Request cancelled."));
  state.operationDiagnostics = recordOperation(state.operationDiagnostics, "ask-iivo", "error", "cancelled");
  push();
}

async function saveFeedMoment(feedId: string): Promise<void> {
  const item = state.commandFeed.find((f) => f.id === feedId);
  if (!item) return;
  const note = item.fullBody ?? item.body;
  moments.add({ kind: "note", note: note.slice(0, 500) });
  await persistMoments(moments);
  if (sessionIsLive()) {
    sessions.addEvent({ kind: "saved_moment", title: note.slice(0, 80) });
    await persistSessions(sessions);
  }
  pushFeed(createCommandFeedItem("moment", "Saved as a moment."));
  state.lastNotice = "Saved moment from IIVO answer.";
  push();
}

/**
 * Command-bar direct ask. Calls POST /api/glass/ask and renders the answer inline
 * as overlay response cards. Falls back to Context Bridge handoff on failure.
 */
async function submitCommand(rawText: string): Promise<void> {
  const text = rawText.trim();
  if (!text || state.askInFlight) return;

  const requestGeneration = ++askRequestGeneration;
  askAbortController?.abort();
  askAbortController = new AbortController();
  const signal = askAbortController.signal;

  state.askInFlight = true;
  state.askStatus = "pending";
  state.lastError = undefined;
  pushFeed(createCommandFeedItem("command", text, { prompt: text }));
  thinkingStartedAtMs = Date.now();
  pushFeed(createCommandFeedItem("thinking", "IIVO is thinking…"));
  state.operationDiagnostics = recordOperation(state.operationDiagnostics, "ask-iivo", "pending");
  push();

  const live = sessionIsLive();
  const session = sessions.current();

  if (live && session) {
    sessions.addEvent({
      kind: "iivo_command",
      title: text.length > 70 ? `${text.slice(0, 69)}…` : text,
      text,
      ...eventContextFields(),
    });
    await persistSessions(sessions);
  }

  try {
    const result = await askIivoGlass(
      config,
      {
        prompt: text,
        session: buildGlassAskSessionPayload(),
        responseStyle: "overlay",
      },
      signal,
    );

    if (requestGeneration !== askRequestGeneration) return;

    if (thinkingStartedAtMs != null) {
      await waitForMinThinkingDuration(thinkingStartedAtMs);
      thinkingStartedAtMs = null;
    }
    if (requestGeneration !== askRequestGeneration) return;

    removeThinkingFeedItems();
    state.askStatus = "done";
    const overlayAnswer = result.shortAnswer ?? result.answer;
    const fullAnswer = result.answer;
    state.lastAskResponse = {
      prompt: text,
      answer: overlayAnswer,
      fullAnswer,
      shortAnswer: result.shortAnswer,
      runId: result.runId,
      contextId: result.contextId,
      at: new Date().toISOString(),
      routeUsed: result.routeUsed,
      model: result.model,
    };

    pushFeed(
      createCommandFeedItem("response", overlayAnswer, {
        prompt: text,
        fullBody: fullAnswer,
        runId: result.runId,
        contextId: result.contextId,
      }),
    );

    if (live && session) {
      sessions.addEvent({
        kind: "iivo_response",
        title: "IIVO response",
        text: fullAnswer,
        importance: "high",
        ...eventContextFields(),
        metadata: { routeUsed: result.routeUsed, model: result.model },
      });
      await persistSessions(sessions);
    }

    state.lastNotice = live
      ? "IIVO answered inline. Saved to session."
      : result.warnings?.[0] ?? "IIVO answered inline. Start a session to save this context.";
    state.operationDiagnostics = recordOperation(state.operationDiagnostics, "ask-iivo", "ok");
  } catch (err) {
    if (requestGeneration !== askRequestGeneration || signal.aborted || err instanceof GlassAskCancelledError) {
      return;
    }

    removeThinkingFeedItems();
    const message = err instanceof Error ? err.message : "Could not reach IIVO server.";
    state.askStatus = "error";
    pushFeed(
      createCommandFeedItem("error", `${message} Use Open in IIVO to continue in the browser.`, {
        prompt: text,
      }),
    );
    state.lastError = message;
    state.operationDiagnostics = recordOperation(state.operationDiagnostics, "ask-iivo", "error", message);
  } finally {
    if (requestGeneration === askRequestGeneration) {
      state.askInFlight = false;
      askAbortController = null;
      if (state.askStatus === "pending") state.askStatus = "idle";
      push();
    }
  }
}

async function handleCommand(command: GlassCommand): Promise<void> {
  switch (command.type) {
    case "capture-screen":
    case "capture-screen-only":
      await handleCapture();
      if (command.type === "capture-screen-only" && !sessionIsLive()) {
        state.lastNotice = state.lastError ? undefined : CAPTURE_NO_SESSION_HINT;
        push();
      }
      return;
    case "request-start-listening":
      state.panelTab = "context";
      if (!isPanelVisible()) togglePanel();
      state.operationDiagnostics = recordOperation(state.operationDiagnostics, "request-start-listening", "pending");
      push();
      broadcastTranscriptionControl({ type: "start" });
      return;
    case "start-listening":
      dispatchPrivacy({ type: "START_LISTENING", at: new Date().toISOString() });
      state.stt = { ...state.stt, listeningElapsedMs: 0, lastError: undefined };
      state.operationDiagnostics = diagnosticsForListening(
        recordOperation(state.operationDiagnostics, "start-listening", "ok"),
        state.transcriptionMode,
        state.stt,
      );
      push();
      return;
    case "pause":
      broadcastTranscriptionControl({ type: "stop" });
      dispatchPrivacy({ type: "PAUSE", at: new Date().toISOString() });
      state.stt = { ...state.stt, listeningElapsedMs: 0 };
      state.operationDiagnostics = recordOperation(state.operationDiagnostics, "pause", "ok");
      state.lastNotice = "Listening stopped.";
      push();
      return;
    case "stop":
    case "stop-everything": {
      const stopped = stopAllActiveCaptureAndListening({
        privacy: state.privacy,
        stt: state.stt,
        diagnostics: state.operationDiagnostics,
        transcriptionMode: state.transcriptionMode,
      });
      state.privacy = stopped.privacy;
      state.stt = stopped.stt;
      state.operationDiagnostics = stopped.diagnostics;
      state.lastNotice = stopped.lastNotice;
      state.lastError = stopped.lastError;
      push();
      return;
    }
    case "append-transcript":
      state.transcript = `${state.transcript}${state.transcript ? " " : ""}${command.text}`.trim();
      push();
      return;
    case "add-transcript-chunk": {
      const chunk = command.text.trim();
      if (!chunk) return;
      state.transcript = `${state.transcript}${state.transcript ? " " : ""}${chunk}`.trim();
      if (sessionIsLive() && sessions.current()?.status === "active") {
        const ctxFields = eventContextFields();
        sessions.addEvent({
          kind: "transcript_note",
          title: chunk.length > 70 ? `${chunk.slice(0, 69)}…` : chunk,
          text: chunk,
          tags: command.tags,
          ...ctxFields,
        });
        await persistSessions(sessions);
      } else if (!sessionIsLive()) {
        state.lastNotice = "Transcript saved. Start a session to keep chunks in the timeline.";
      }
      push();
      return;
    }
    case "transcription-set-mode":
      state.transcriptionMode = command.mode;
      push();
      return;
    case "system-audio-set-status":
      state.systemAudioStatus = command.status;
      state.systemAudioDetail = command.detail;
      push();
      return;
    case "stt-listening-timer":
      state.stt = { ...state.stt, listeningElapsedMs: command.elapsedMs };
      push();
      return;
    case "stt-cost-warning":
      state.lastNotice = listeningCostWarningMessage();
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
      state.panelTab = "summary";
      if (!isPanelVisible()) togglePanel();
      if (state.transcript.trim()) {
        await sendTranscript();
      }
      push();
      return;
    case "submit-command":
    case "ask-iivo-direct":
      await submitCommand(command.text);
      return;
    case "cancel-glass-ask":
      cancelGlassAsk();
      return;
    case "set-glass-hotkey":
      state.glassSettings = { ...state.glassSettings, hotkeyPreset: command.preset };
      glassUserSettings = state.glassSettings;
      await persistGlassUserSettings(glassUserSettings);
      registerGlobalHotkeys();
      push();
      return;
    case "set-glass-display": {
      const displayTarget = sanitizeDisplayTarget(command.target);
      state.glassSettings = { ...state.glassSettings, displayTarget };
      glassUserSettings = state.glassSettings;
      await persistGlassUserSettings(glassUserSettings);
      applyGlassUserSettings(glassUserSettings);
      push();
      return;
    }
    case "refresh-glass-layout":
      refreshGlassDisplayLayout();
      push();
      return;
    case "open-feed-in-iivo":
      try {
        await openFeedInIivo(command.id);
      } catch (err) {
        state.lastError = err instanceof Error ? err.message : "Open in IIVO failed";
        push();
      }
      return;
    case "save-feed-moment":
      await saveFeedMoment(command.id);
      return;
    case "command-bar-blur":
      blurCommandBar();
      return;
    case "toggle-command-bar":
      toggleCommandBar();
      push();
      return;
    case "clear-command-feed":
      state.commandFeed = [];
      setOverlayClickThrough(true);
      push();
      return;
    case "pin-command-feed-item":
      state.commandFeed = state.commandFeed.map((item) =>
        item.id === command.id ? { ...item, pinned: command.pinned } : item,
      );
      push();
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
      push();
      return;
    case "toggle-overlay":
      toggleOverlay();
      push();
      return;
    case "set-overlay-mode":
      setOverlayMode(command.mode);
      push();
      return;
    case "window-context-refresh":
      state.windowContext = await refreshWindowContext();
      push();
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
        const ctxFields = eventContextFields({ sourceTitle: command.sourceTitle });
        sessions.addEvent({
          kind: "manual_note",
          title: text.length > 70 ? `${text.slice(0, 69)}…` : text,
          text,
          sourceApp: ctxFields.sourceApp,
          sourceTitle: ctxFields.sourceTitle ?? command.sourceTitle,
          metadata: ctxFields.metadata,
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
        state.operationDiagnostics = recordOperation(state.operationDiagnostics, "session-capture", "error", state.lastNotice);
        push();
        break;
      }
      const session = sessions.current();
      if (!session) break;
      state.lastError = undefined;
      const captureTarget = resolveCaptureDisplay(state.glassSettings.displayTarget);
      state.operationDiagnostics = {
        ...recordOperation(state.operationDiagnostics, "session-capture", "pending"),
        captureStatus: `Capturing ${captureTarget.label}`,
      };
      dispatchPrivacy({ type: "CAPTURE_START", at: new Date().toISOString() });
      push();
      try {
        const result = await captureDisplayById(captureTarget.id, captureTarget.label);
        const ctxFields = eventContextFields({ captureSource: result.sourceName });
        const event = sessions.addEvent({
          kind: "screen_capture",
          title: `Screen capture · ${result.displayLabel} (${result.width}×${result.height})`,
          sourceApp: ctxFields.sourceApp,
          sourceTitle: ctxFields.sourceTitle ?? result.sourceName,
          importance: "medium",
          metadata: ctxFields.metadata,
        });
        if (event) {
          const refs = await saveSessionScreenshot(session.id, event.id, result.imageDataUrl);
          event.screenshotPath = refs.screenshotPath;
          event.thumbnailPath = refs.thumbnailPath;
          event.screenshotMimeType = refs.screenshotMimeType;
          event.screenshotSizeBytes = refs.screenshotSizeBytes;
          event.screenshotDataUrl = result.imageDataUrl;
        }
        state.lastNotice = `${CAPTURE_SESSION_SUCCESS_MESSAGE} (${result.displayLabel})`;
        state.operationDiagnostics = diagnosticsForCapture(
          state.operationDiagnostics,
          true,
          undefined,
          result.displayLabel,
        );
      } catch (err) {
        const message = captureErrorMessage(err);
        state.lastError = message;
        state.operationDiagnostics = diagnosticsForCapture(state.operationDiagnostics, false, message);
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
    case "session-open-in-iivo":
    case "session-analyze-council":
      await sendSession(true);
      break;
    case "session-analyze-now":
      await analyzeSessionNow();
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
        ? `Session opened in IIVO (${eventCount} events, ${insightCount} insights)`
        : `Session sent to IIVO (${eventCount} events, ${insightCount} insights)`,
    });
    state.iivoAnalysis = { ...state.iivoAnalysis, contextId: item.id };
    await openHandoff(item.id);
    state.sessionActionStatus = "opened";
    state.lastNotice = forCouncilAnalysis
      ? truncated
        ? "Opened in IIVO (timeline truncated)."
        : "Opened in IIVO with session context."
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

async function analyzeSessionNow(): Promise<void> {
  const session = sessions.current();
  if (!session) {
    state.lastNotice = "No session to analyze.";
    push();
    return;
  }
  state.lastError = undefined;
  state.iivoAnalysis = { status: "running", updatedAt: new Date().toISOString() };
  push();

  const estimate = await estimateCouncilCredits(config, buildSessionAnalysisPrompt());
  if (estimate) {
    state.iivoAnalysis = {
      ...state.iivoAnalysis,
      estimatedCredits: estimate.estimatedCredits,
    };
    state.lastNotice = `Analyze Now may use ~${estimate.estimatedCredits} credits (${estimate.currentCredits} remaining).`;
    push();
  }

  try {
    const result = await runCouncilAnalysis(config, buildCouncilRunRequest(session));
    state.iivoAnalysis = {
      status: "done",
      text: result.answer,
      runId: result.runId,
      updatedAt: new Date().toISOString(),
    };
    sessions.addEvent({
      kind: "iivo_analysis",
      title: "IIVO Council analysis",
      text: result.answer,
      importance: "high",
    });
    state.lastNotice = "Analysis complete — see IIVO Analysis below.";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Analysis failed";
    state.iivoAnalysis = {
      status: "failed",
      error: msg,
      updatedAt: new Date().toISOString(),
    };
    state.lastError = buildAnalysisFailureNotice(msg);
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
  ipcMain.handle(IPC.windowContextGet, () => getCurrentWindowContext());
  ipcMain.handle(IPC.sttProcessChunk, (_event, payload: SttProcessChunkPayload) =>
    processSttChunk(payload, {
      userDataPath: app.getPath("userData"),
      glassConfig: config,
      sessions,
      sessionIsLive,
      eventContextFields,
      persistSessions,
      appendTranscript(text: string) {
        state.transcript = `${state.transcript}${state.transcript ? " " : ""}${text}`.trim();
      },
      getSttState: () => state.stt,
      setSttState(next: GlassSttState) {
        state.stt = next;
      },
      setLastNotice(msg) {
        state.lastNotice = msg;
      },
      setLastError(msg) {
        state.lastError = msg;
      },
      push,
    }),
  );

  ipcMain.on(IPC.command, (_event, command: GlassCommand) => {
    void handleCommand(command).catch((err) => {
      state.lastError = err instanceof Error ? err.message : String(err);
      push();
    });
  });

  ipcMain.on(IPC.setIgnoreMouse, (event, ignore: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    setIgnoreMouseFromWindow(win, !!ignore);
  });

  ipcMain.on(IPC.resizeDock, (_event, width: number, height: number) => {
    if (typeof width === "number" && typeof height === "number") {
      resizeDockWindow(width, height);
    }
  });

  if (process.env.IIVO_GLASS_E2E === "1") {
    ipcMain.handle(IPC.e2eGetExternalUrls, () => getE2eExternalUrls());
    ipcMain.handle(IPC.e2eResetExternalUrls, () => {
      resetE2eExternalUrls();
    });
    ipcMain.handle(IPC.e2eGetWindowMetadata, () => getGlassE2eWindowMetadata());
    ipcMain.handle(IPC.e2eGetCaptureTarget, () =>
      resolveCaptureDisplay(glassUserSettings.displayTarget),
    );
  }
}

function registerGlobalHotkeys(): void {
  const status = registerCommandBarHotkeys(state.glassSettings.hotkeyPreset);
  state.operationDiagnostics = {
    ...state.operationDiagnostics,
    hotkeyStatus: status,
  };
}

app.whenReady().then(async () => {
  registerScreenshotProtocol();
  registerSystemAudioHandler();
  moments = await loadMoments();
  sessions = await loadSessions();
  glassUserSettings = await loadGlassUserSettings();
  const sanitizedTarget = sanitizeDisplayTarget(glassUserSettings.displayTarget);
  if (sanitizedTarget !== glassUserSettings.displayTarget) {
    glassUserSettings = { ...glassUserSettings, displayTarget: sanitizedTarget };
    await persistGlassUserSettings(glassUserSettings);
  }
  if (process.env.IIVO_GLASS_E2E === "1") {
    glassUserSettings = { ...glassUserSettings, hotkeyPreset: "disabled" };
  }
  state.glassSettings = glassUserSettings;
  state.windowContext = await getCurrentWindowContext();
  registerIpc();
  createWindows(config, glassUserSettings.displayTarget);
  applyGlassUserSettings(glassUserSettings);
  registerGlobalHotkeys();
  push();

  app.on("activate", () => {
    if (getWindows() === null) {
      createWindows(config, glassUserSettings.displayTarget);
      applyGlassUserSettings(glassUserSettings);
      registerGlobalHotkeys();
      push();
    }
  });
});

app.on("will-quit", () => {
  unregisterCommandBarHotkeys();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
