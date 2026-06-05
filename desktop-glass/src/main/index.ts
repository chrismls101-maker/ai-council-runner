/**
 * IIVO Glass — Electron main process.
 *
 * Owns the canonical Glass state, handles user-initiated commands, talks to the
 * existing IIVO Context Bridge API, and hands off to the IIVO web app. Nothing
 * captures or sends without an explicit command from the UI.
 */

import { loadGlassEnv } from "./loadGlassEnv.ts";
import { installGlassE2eHooks, getE2eExternalUrls, resetE2eExternalUrls } from "./e2eMainHooks.ts";
import { installDefaultGlassHandoffOpener, openGlassHandoffUrl } from "./glassBrowserHandoff.ts";
import { getGlassE2eWindowMetadata } from "./e2eWindowMetadata.ts";
import { join } from "node:path";
import { app, BrowserWindow, ipcMain, protocol, shell, type WebContents } from "electron";
import { GLASS_BOOT_DURATION_MS } from "../shared/bootTiming.ts";
import { isBootSplashBundlePresent } from "../shared/bootSplash.ts";
import { DOCK_MIN_WIDTH_VERTICAL } from "../shared/glassLayoutMath.ts";
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
import { waitForMinLookingDuration, waitForMinThinkingDuration } from "../shared/glassAskTiming.ts";
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
  beginGlassBootSequence,
  createSplashWindow,
  createWindows,
  finishSplash,
  whenGlassWindowsReady,
  getCommandBarHotkeyStatus,
  applyGlassUserSettings,
  getAvailableDisplayIds,
  getConnectedDisplays,
  getDisplayLayoutSummary,
  refreshGlassDisplayLayout,
  getGlassWindowState,
  getWindows,
  isPanelVisible,
  lockChromeLayout,
  unlockChromeLayout,
  resetChromeLayoutOrigins,
  nudgeChromeWindowFromWebContents,
  registerCommandBarHotkeys,
  resizeDockWindow,
  setChromeLayoutPersistHandler,
  syncChromeLayoutFromSettings,
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
import { MIC_PAUSED_AUTO_MESSAGE } from "../shared/commandBarMic.ts";
import { SessionCopilotController } from "../shared/copilotController.ts";
import {
  buildDeterministicDiagnosticFallback,
  buildDiagnosticAnalysisPrompt,
  parseDiagnosticAnalysisResponse,
} from "../shared/copilotDiagnosticAnalysis.ts";
import {
  buildSemanticSessionTypePrompt,
  canSemanticRefineOnDebrief,
  parseSemanticSessionTypeResponse,
} from "../shared/copilotSessionSemantic.ts";
import { SESSION_TYPE_LABELS } from "../shared/copilotSessionType.ts";
import type { CopilotResolution } from "../shared/copilotController.ts";
import {
  copilotModeIsActive,
  type GlassCopilotConfig,
  type GlassCopilotMode,
  type GlassCopilotRuntimeState,
} from "../shared/copilotTypes.ts";
import { shouldOfferCopilot, withCopilotConfig } from "../shared/copilotConfig.ts";
import {
  buildSessionDebrief,
  buildDebriefAiPrompt,
  detectDebriefTrigger,
} from "../shared/copilotDebrief.ts";
import {
  createListeningLimitState,
  extendListeningLimit,
  LISTENING_LIMIT_RESPONSE_TIMEOUT_MS,
  markListeningLimitReached,
  resetListeningLimitState,
  shouldAutoStopListeningLimit,
  shouldTriggerListeningLimit,
  type ListeningLimitState,
} from "../shared/listeningLimit.ts";
import { processSttChunk, type SttProcessChunkPayload } from "./sttChunkHandler.ts";
import type { GlassSttState } from "../shared/ipc.ts";
import {
  CAPTURE_NO_SESSION_HINT,
  CAPTURE_SESSION_SUCCESS_MESSAGE,
  CAPTURE_SUCCESS_MESSAGE,
  LISTENING_STOPPED_MESSAGE,
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
import { askIivoGlass, GlassAskCancelledError, isGlassAskPayloadTooLargeError } from "./glassAskClient.ts";
import { optimizeVisualAskImage } from "./visualImageOptimizer.ts";
import { applyOptimizedToPayload } from "./glassVisualAskCapture.ts";
import {
  GLASS_VISUAL_PAYLOAD_RETRY_MESSAGE,
  GLASS_VISUAL_PAYLOAD_TOO_LARGE_MESSAGE,
} from "../shared/visualImageOptimizerConfig.ts";
import type { VisualAskPayloadDiagnostics } from "../shared/glassScreenContext.ts";
import { chooseVisualQualityPreset } from "../shared/visualAskQuality.ts";
import {
  formatBytesShort,
  visualAskUserMessageForFrame,
  type VisualAskDiagnostics,
} from "../shared/visualAskDiagnostics.ts";
import {
  preflightCodeToServerResult,
} from "../shared/visualAskPreflight.ts";
import { runVisualAskPreflight } from "./glassVisualAskPreflight.ts";
import { uploadGlassScreenshotContext } from "./glassLatestScreenshot.ts";
import {
  buildVisualAskRetentionStatus,
  shouldAutoUploadCapturesToContext,
  shouldDiscardEphemeralAfterAsk,
  type EphemeralVisualCapture,
  type GlassVisualAskRetention,
} from "../shared/glassScreenshotRetention.ts";
import { createLatestScreenshotState } from "../shared/glassLatestScreenshotAsk.ts";
import type { GlassAskSessionPayload, GlassAskStatus, GlassLastAskResponse } from "../shared/glassAskTypes.ts";
import {
  buildGlassScreenContextStatus,
  promptRequestsGlassScreenVisual,
  type GlassLatestScreenshotState,
  type GlassScreenContextPhase,
} from "../shared/glassScreenContext.ts";
import { resolveScreenshotForVisualAsk } from "./glassVisualAskCapture.ts";
import {
  DEFAULT_GLASS_USER_SETTINGS,
  type GlassUserSettings,
} from "../shared/glassSettings.ts";
import { loadGlassUserSettings, persistGlassUserSettings } from "./glassSettingsPersistence.ts";
import {
  buildGlassSetupCapabilities,
  formatSetupCheckSummary,
  mapCaptureErrorToScreenCaptureStatus,
  VIRTUAL_AUDIO_HELP_DETAIL,
  type GlassCapabilityRow,
  type GlassServerHealthForSetup,
  type MicPermissionReport,
  type ScreenCaptureProbeStatus,
  type WindowCaptureProbeStatus,
} from "../shared/glassCapabilities.ts";
import type { CaptureDiagnosticsReport } from "../shared/captureDiagnostics.ts";
import { runCaptureDiagnosticsReport } from "./captureDiagnostics.ts";
import {
  collectGlassAppIdentityReport,
  findDuplicateGlassAppBundles,
} from "./glassAppIdentityDiagnostic.ts";
import { runGlassSetupCheck } from "./glassSetupCheck.ts";
import { openGlassSystemSettings } from "./glassSystemSettings.ts";
import { glassMenuAppName } from "../shared/glassAppIdentity.ts";
import type { GlassAppIdentityReport, DuplicateGlassAppBundle } from "../shared/glassAppIdentityReport.ts";
import { buildDuplicateAppWarning } from "../shared/glassPackagingVariant.ts";
import type { ScreenCaptureProbeSnapshot } from "../shared/screenCaptureProbe.ts";
import {
  DUPLICATE_APP_CAPTURE_FAILURE_MESSAGE,
  formatScreenCaptureProbeDebug,
} from "../shared/screenCaptureProbe.ts";
import { detectVirtualAudioDevices } from "../shared/virtualAudioDevices.ts";
import { BLACKHOLE_SETUP_INSTRUCTIONS } from "../shared/virtualAudioCapture.ts";
import type { VirtualAudioDeviceMatch } from "../shared/virtualAudioDevices.ts";

loadGlassEnv();
app.setName(glassMenuAppName(app.isPackaged));
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
installDefaultGlassHandoffOpener();
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
  latestScreenshot?: GlassLatestScreenshotState | null;
  visualAskPhase: GlassScreenContextPhase;
  visualAskRetention: GlassVisualAskRetention | null;
  visualAskPayloadDiagnostics: VisualAskPayloadDiagnostics | null;
  visualAskDiagnostics: VisualAskDiagnostics | null;
  ephemeralVisualCapture: EphemeralVisualCapture | null;
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
  screenCaptureProbe: ScreenCaptureProbeStatus;
  screenCaptureDetail?: string;
  windowCaptureProbe: WindowCaptureProbeStatus;
  windowCaptureDetail?: string;
  micPermission: MicPermissionReport;
  serverHealthForSetup: GlassServerHealthForSetup | null;
  setupCapabilities: GlassCapabilityRow[];
  setupCheckSummary?: string;
  captureDiagnosticsReport?: CaptureDiagnosticsReport;
  appIdentityReport?: GlassAppIdentityReport;
  duplicateAppBundles: DuplicateGlassAppBundle[];
  duplicateAppWarning?: string;
  virtualAudioDevices: VirtualAudioDeviceMatch[];
  selectedVirtualAudioDeviceId?: string;
  nativeLoopbackTested: boolean;
}

let askAbortController: AbortController | null = null;
let askRequestGeneration = 0;
let thinkingStartedAtMs: number | null = null;
let lookingStartedAtMs: number | null = null;
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
  latestScreenshot: null,
  visualAskPhase: "idle",
  visualAskRetention: null,
  visualAskPayloadDiagnostics: null,
  visualAskDiagnostics: null,
  ephemeralVisualCapture: null,
  glassSettings: { ...DEFAULT_GLASS_USER_SETTINGS },
  screenCaptureProbe: "unknown",
  windowCaptureProbe: "unknown",
  micPermission: "not_requested",
  serverHealthForSetup: null,
  setupCapabilities: [],
  duplicateAppBundles: [],
  virtualAudioDevices: [],
  nativeLoopbackTested: false,
};

let moments = new SavedMomentsStore();
let sessions = new GlassSessionStore();

function sessionIsLive(): boolean {
  const s = sessions.current();
  return !!s && (s.status === "active" || s.status === "paused");
}

// --- Session Copilot ---------------------------------------------------------
const copilot = new SessionCopilotController({
  idFactory: () => {
    try {
      if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    } catch {
      /* fall through */
    }
    return `copilot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  },
  clock: () => new Date().toISOString(),
  now: () => Date.now(),
});
let copilotTimer: ReturnType<typeof setInterval> | null = null;
let copilotBoundSessionId: string | null = null;
let copilotOffered = false;
let systemAudioLastSignalMs: number | undefined;
let copilotVisualAskFailures = 0;
const copilotRecentCommands: string[] = [];
const copilotRecentResponses: string[] = [];

// --- Max listening duration --------------------------------------------------
let listeningLimitState: ListeningLimitState = createListeningLimitState();
let listeningLimitAutoStopTimer: ReturnType<typeof setTimeout> | null = null;

function clearListeningLimitAutoStopTimer(): void {
  if (listeningLimitAutoStopTimer) {
    clearTimeout(listeningLimitAutoStopTimer);
    listeningLimitAutoStopTimer = null;
  }
}

function resetListeningLimitTracking(): void {
  listeningLimitState = resetListeningLimitState();
  clearListeningLimitAutoStopTimer();
}

function scheduleListeningLimitAutoStop(): void {
  clearListeningLimitAutoStopTimer();
  listeningLimitAutoStopTimer = setTimeout(() => {
    if (
      shouldAutoStopListeningLimit(listeningLimitState, Date.now()) &&
      state.privacy.listening
    ) {
      void stopListeningFromLimit("auto");
    }
  }, LISTENING_LIMIT_RESPONSE_TIMEOUT_MS);
}

async function recordListeningLimitReachedEvent(): Promise<void> {
  if (!sessionIsLive()) return;
  const maxMin = copilot.getConfig().maxListeningMin;
  sessions.addEvent({
    kind: "listening_limit_reached",
    title: "Listening limit reached",
    text: `Max listening duration (${maxMin} min) reached.`,
    importance: "medium",
    ...eventContextFields(),
  });
  await persistSessions(sessions);
}

async function triggerListeningLimitReached(): Promise<void> {
  listeningLimitState = markListeningLimitReached(listeningLimitState, Date.now());
  await recordListeningLimitReachedEvent();
  scheduleListeningLimitAutoStop();
  push();
}

function checkListeningLimit(elapsedMs: number): void {
  if (
    shouldTriggerListeningLimit({
      elapsedMs,
      maxListeningMin: copilot.getConfig().maxListeningMin,
      extensionMs: listeningLimitState.extensionMs,
      limitReached: listeningLimitState.limitReached,
      listening: state.privacy.listening,
    })
  ) {
    void triggerListeningLimitReached();
  }
}

async function stopListeningFromLimit(reason: "user" | "auto"): Promise<void> {
  broadcastTranscriptionControl({ type: "stop" });
  dispatchPrivacy({ type: "PAUSE", at: new Date().toISOString() });
  state.stt = { ...state.stt, listeningElapsedMs: 0 };
  state.operationDiagnostics = recordOperation(state.operationDiagnostics, "pause", "ok");
  resetListeningLimitTracking();
  state.lastNotice =
    reason === "auto"
      ? "Listening stopped — limit reached with no response."
      : LISTENING_STOPPED_MESSAGE;
  push();
}

function systemAudioActive(): boolean {
  return state.privacy.listening && state.transcriptionMode === "system_audio";
}

function trackCopilotCommand(text: string): void {
  copilotRecentCommands.push(text);
  if (copilotRecentCommands.length > 12) copilotRecentCommands.shift();
}

function trackCopilotResponse(text: string): void {
  copilotRecentResponses.push(text);
  if (copilotRecentResponses.length > 12) copilotRecentResponses.shift();
}

/** Mirror live copilot state onto the current session for persistence. */
function syncCopilotToSession(): void {
  if (!sessions.current()) return;
  sessions.setCopilotData(copilot.sessionData());
}

function copilotRuntime(): GlassCopilotRuntimeState {
  return {
    ...copilot.runtimeState(sessionIsLive()),
    listeningLimitReached: listeningLimitState.limitReached,
  };
}

/** Bind copilot to the active session (resets per-session state, hydrates persisted data). */
function bindCopilotToSession(): void {
  const session = sessions.current();
  const id = session?.id ?? null;
  if (copilotBoundSessionId === id) return;
  copilotBoundSessionId = id;
  copilotOffered = false;
  copilotVisualAskFailures = 0;
  copilotRecentCommands.length = 0;
  copilotRecentResponses.length = 0;
  copilot.bindSession(id);
  if (session?.copilot) {
    copilot.hydrate(session.id, session.copilot);
  }
}

function startCopilotLoop(): void {
  if (copilotTimer) return;
  if (!sessionIsLive() || !copilotModeIsActive(copilot.getConfig().mode)) return;
  const intervalMs = copilot.getConfig().intervalSec * 1000;
  copilotTimer = setInterval(() => {
    void runCopilotTick();
  }, intervalMs);
}

function stopCopilotLoop(): void {
  if (copilotTimer) {
    clearInterval(copilotTimer);
    copilotTimer = null;
  }
}

/** Restart the loop (e.g. after interval or mode change). */
function refreshCopilotLoop(): void {
  stopCopilotLoop();
  startCopilotLoop();
}

async function runCopilotTick(): Promise<void> {
  const session = sessions.current();
  const result = copilot.tick({
    sessionLive: sessionIsLive(),
    session,
    transcript: state.transcript,
    recentCommands: copilotRecentCommands,
    recentResponses: copilotRecentResponses,
    sourceApp: getCachedWindowContext().appName,
    sourceTitle: getCachedWindowContext().windowTitle,
    systemAudioActive: systemAudioActive(),
    systemAudioLastSignalMs,
    visualAskFailureCount: copilotVisualAskFailures,
  });
  if (!result.ran && !result.systemAudioSilenceWarning) return;
  if (result.intervention) {
    pushFeed(
      createCommandFeedItem("response", result.intervention.body, {
        title: `Copilot · ${result.intervention.title}`,
      }),
    );
  } else if (copilot.getConfig().mode === "passive" && result.newInsights.length > 0) {
    // Passive mode is near-silent: a tiny status, never a suggestion card.
    const n = result.newInsights.length;
    state.lastNotice = `Copilot captured ${n} idea${n === 1 ? "" : "s"}.`;
  }
  syncCopilotToSession();
  await persistSessions(sessions);
  push();
}

/** Offer to turn on Copilot when system audio starts inside a live session. */
function maybeOfferCopilotForSystemAudio(): void {
  if (!systemAudioActive()) return;
  systemAudioLastSignalMs = Date.now();
  const offer = shouldOfferCopilot({
    mode: copilot.getConfig().mode,
    sessionLive: sessionIsLive(),
    systemAudioActive: systemAudioActive(),
    alreadyOffered: copilotOffered,
  });
  if (offer) {
    copilot.setOffer({ reason: "system_audio", createdAt: new Date().toISOString() });
    copilotOffered = true;
  }
}

function refreshAppIdentityState(): void {
  state.appIdentityReport = collectGlassAppIdentityReport();
  state.duplicateAppBundles = findDuplicateGlassAppBundles(process.execPath);
  state.duplicateAppWarning = buildDuplicateAppWarning(
    state.duplicateAppBundles,
    state.appIdentityReport.bundlePath,
  );
}

function visualAskProbeDiagnostics(
  screenProbe: ScreenCaptureProbeSnapshot | undefined,
): Partial<import("../shared/visualAskDiagnostics.ts").VisualAskDiagnostics> {
  const id = state.appIdentityReport;
  if (!screenProbe) {
    return {
      runningAppPath: id?.bundlePath ?? id?.execPath,
      runningBundleId: id?.bundleIdentifier,
      packagingVariant: id?.packagingVariantLabel,
    };
  }
  return {
    preflightProbeResult: screenProbe.status,
    preflightThumbnailEmpty: screenProbe.probe.thumbnailEmpty ?? false,
    preflightSourceCount: screenProbe.probe.sourceCount,
    preflightDisplayId: screenProbe.displayId,
    runningAppPath: id?.bundlePath ?? id?.execPath,
    runningBundleId: id?.bundleIdentifier,
    packagingVariant: id?.packagingVariantLabel,
    lastPreflightIssue: formatScreenCaptureProbeDebug(screenProbe),
  };
}

function refreshSetupCapabilities(): void {
  state.setupCapabilities = buildGlassSetupCapabilities({
    platform: process.platform,
    screenCaptureProbe: state.screenCaptureProbe,
    screenCaptureDetail: state.screenCaptureDetail,
    windowCaptureProbe: state.windowCaptureProbe,
    windowCaptureDetail: state.windowCaptureDetail,
    captureStatus: state.operationDiagnostics.captureStatus,
    micPermission: state.micPermission,
    micListening: state.privacy.listening,
    systemAudioStatus: state.systemAudioStatus,
    systemAudioDetail: state.systemAudioDetail,
    virtualAudioDevices: state.virtualAudioDevices,
    selectedVirtualAudioDeviceId: state.selectedVirtualAudioDeviceId,
    transcriptionMode: state.transcriptionMode,
    serverHealth: state.serverHealthForSetup,
    sttStatus: state.stt.status,
    sttEnabled: state.stt.enabled,
    lastError: state.lastError,
  });
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
    latestScreenshot: state.latestScreenshot ?? null,
    screenContextStatus: buildGlassScreenContextStatus(state.latestScreenshot, {
      phase: state.visualAskPhase,
    }),
    visualAskRetention: state.visualAskRetention,
    visualAskPayloadDiagnostics: state.visualAskPayloadDiagnostics,
    visualAskDiagnostics: state.visualAskDiagnostics,
    glassSettings: state.glassSettings,
    availableDisplayIds: getAvailableDisplayIds(),
    connectedDisplays: getConnectedDisplays(),
    setupCapabilities: state.setupCapabilities,
    setupCheckSummary: state.setupCheckSummary,
    captureDiagnosticsReport: state.captureDiagnosticsReport,
    appIdentityReport: state.appIdentityReport,
    duplicateAppBundles: state.duplicateAppBundles,
    duplicateAppWarning: state.duplicateAppWarning,
    virtualAudioDevices: state.virtualAudioDevices,
    selectedVirtualAudioDeviceId: state.selectedVirtualAudioDeviceId,
    micPermission: state.micPermission,
    copilot: copilotRuntime(),
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
  refreshSetupCapabilities();
  broadcast(IPC.state, snapshot());
}

function dispatchPrivacy(action: Parameters<typeof privacyReducer>[1]): void {
  state.privacy = privacyReducer(state.privacy, action);
}

async function openHandoff(contextId: string): Promise<void> {
  const url = buildLensAskUrl(config, contextId);
  state.lastSentUrl = url;
  const opened = await openGlassHandoffUrl(url);
  if (!opened.ok) {
    throw new Error(opened.error);
  }
}

async function registerLatestGlassCapture(input: {
  imageDataUrl: string;
  displayLabel: string;
  displayId: number;
  sourceTitle?: string;
  sessionId?: string;
  eventId?: string;
  screenshotPath?: string;
  thumbnailPath?: string;
  mimeType?: string;
}): Promise<void> {
  state.latestScreenshot = createLatestScreenshotState({
    ...input,
    contextUploadStatus: "none",
  });
  push();

  if (!shouldAutoUploadCapturesToContext(state.glassSettings)) {
    return;
  }

  const title = `IIVO Glass capture ${new Date().toLocaleString()}${input.displayLabel ? ` · ${input.displayLabel}` : ""}`;
  state.latestScreenshot.contextUploadStatus = "pending";
  push();
  const contextId = await uploadGlassScreenshotContext(config, input.imageDataUrl, title);
  if (state.latestScreenshot) {
    if (contextId) {
      state.latestScreenshot.contextId = contextId;
      state.latestScreenshot.contextUploadStatus = "ready";
    } else {
      state.latestScreenshot.contextUploadStatus = "failed";
    }
    push();
  }
}

async function uploadEphemeralVisualToContext(
  capture: EphemeralVisualCapture,
  title: string,
): Promise<string | undefined> {
  return uploadGlassScreenshotContext(config, capture.imageDataUrl, title);
}

function setEphemeralVisualCapture(input: {
  imageDataUrl: string;
  displayLabel?: string;
  displayId?: number;
  sourceTitle?: string;
  sessionId?: string;
  eventId?: string;
}): void {
  state.ephemeralVisualCapture = {
    imageDataUrl: input.imageDataUrl,
    capturedAt: new Date().toISOString(),
    displayLabel: input.displayLabel,
    displayId: input.displayId,
    sourceTitle: input.sourceTitle,
    sessionId: input.sessionId,
    eventId: input.eventId,
  };
}

function clearEphemeralVisualCapture(): void {
  state.ephemeralVisualCapture = null;
}

async function persistEphemeralVisualToSession(): Promise<boolean> {
  const ephemeral = state.ephemeralVisualCapture;
  if (!ephemeral || !sessionIsLive()) return false;
  const session = sessions.current();
  if (!session) return false;

  const ctxFields = eventContextFields({ sourceTitle: ephemeral.sourceTitle });
  const event = sessions.addEvent({
    kind: "screen_capture",
    title: `Screen capture · ${ephemeral.displayLabel ?? "Display"}`,
    sourceApp: ctxFields.sourceApp,
    sourceTitle: ctxFields.sourceTitle ?? ephemeral.sourceTitle,
    importance: "medium",
    metadata: { ...ctxFields.metadata, source: "visual_ask_save" },
  });
  if (!event) return false;

  const refs = await saveSessionScreenshot(session.id, event.id, ephemeral.imageDataUrl);
  event.screenshotPath = refs.screenshotPath;
  event.thumbnailPath = refs.thumbnailPath;
  event.screenshotMimeType = refs.screenshotMimeType;
  event.screenshotSizeBytes = refs.screenshotSizeBytes;

  state.latestScreenshot = createLatestScreenshotState({
    displayLabel: ephemeral.displayLabel ?? "Display",
    displayId: ephemeral.displayId ?? 0,
    sourceTitle: ephemeral.sourceTitle,
    sessionId: session.id,
    eventId: event.id,
    screenshotPath: refs.screenshotPath,
    thumbnailPath: refs.thumbnailPath,
    mimeType: refs.screenshotMimeType,
    contextUploadStatus: state.latestScreenshot?.contextUploadStatus ?? "none",
  });
  clearEphemeralVisualCapture();
  await persistSessions(sessions);
  return true;
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
    await registerLatestGlassCapture({
      imageDataUrl: result.imageDataUrl,
      displayLabel: result.displayLabel,
      displayId: result.displayId,
      sourceTitle: result.sourceName,
    });
    state.lastNotice = `${CAPTURE_SUCCESS_MESSAGE} (${result.displayLabel})`;
    state.screenCaptureProbe = "ready";
    state.screenCaptureDetail = undefined;
    state.operationDiagnostics = diagnosticsForCapture(
      state.operationDiagnostics,
      true,
      undefined,
      result.displayLabel,
    );
    dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
    refreshSetupCapabilities();
    push();
    return result.imageDataUrl;
  } catch (err) {
    const message = captureErrorMessage(err);
    state.lastError = message;
    state.lastNotice = /permission|screen recording/i.test(message)
      ? "Screen Recording permission needed. Open Settings, grant access to IIVO Glass, then Retry Capture."
      : message;
    state.screenCaptureProbe = mapCaptureErrorToScreenCaptureStatus(message);
    state.screenCaptureDetail = message;
    state.operationDiagnostics = diagnosticsForCapture(state.operationDiagnostics, false, message);
    dispatchPrivacy({ type: "CAPTURE_DONE", at: new Date().toISOString() });
    refreshSetupCapabilities();
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

function mergeVisualAskDiagnostics(partial: Partial<VisualAskDiagnostics>): void {
  state.visualAskDiagnostics = {
    phase: state.visualAskPhase,
    displayLabel: state.latestScreenshot?.displayLabel,
    displayId: state.latestScreenshot?.displayId,
    ...state.visualAskDiagnostics,
    ...partial,
  };
}

function visualDiagnosticsFromPayload(
  diag: VisualAskPayloadDiagnostics,
  extra?: Partial<VisualAskDiagnostics>,
): VisualAskDiagnostics {
  return {
    phase: state.visualAskPhase,
    originalDimensions: { width: diag.originalWidth, height: diag.originalHeight },
    optimizedDimensions: { width: diag.optimizedWidth, height: diag.optimizedHeight },
    optimizedSizeBytes: diag.optimizedSizeBytes,
    compressionPreset: diag.qualityPreset,
    qualityPreset: diag.qualityPreset,
    visualFrameMode: diag.visualFrameMode,
    cropBounds: diag.cropBounds,
    retryUsed: diag.status === "retry",
    ...extra,
  };
}

function buildVisualAskStatusMessages(
  captureLabel: string,
  diag: VisualAskPayloadDiagnostics | null | undefined,
): string[] {
  const messages: string[] = [];
  if (captureLabel) {
    messages.push(visualAskUserMessageForFrame("screen", captureLabel));
  }
  if (diag?.qualityPreset === "text") {
    messages.push("Using text clarity mode.");
  }
  if (diag?.visualFrameMode) {
    messages.push(visualAskUserMessageForFrame(diag.visualFrameMode));
  }
  if (diag?.optimizedSizeBytes) {
    messages.push(`Optimized screen image to ${formatBytesShort(diag.optimizedSizeBytes)}.`);
  }
  return messages;
}

async function openFeedInIivo(feedId: string): Promise<void> {
  const item = state.commandFeed.find((f) => f.id === feedId);
  if (!item) return;

  if (item.runId) {
    const runUrl = buildRunHistoryUrl(config, item.runId);
    state.lastSentUrl = runUrl;
    const opened = await openGlassHandoffUrl(runUrl);
    if (opened.ok) {
      state.lastNotice = "Opened run in IIVO.";
      mergeVisualAskDiagnostics({ handoffUrl: runUrl, serverResult: "success" });
    } else {
      state.lastNotice = opened.copiedToClipboard
        ? `Could not open browser. URL copied to clipboard: ${runUrl}`
        : `Could not open browser. Copy this URL: ${runUrl}`;
      state.lastError = opened.error;
      mergeVisualAskDiagnostics({
        handoffUrl: runUrl,
        serverResult: "network_error",
        userMessage: opened.error,
      });
    }
    push();
    return;
  }

  if (item.contextId) {
    const url = buildLensAskUrl(config, item.contextId);
    try {
      await openHandoff(item.contextId);
      state.lastNotice = "Opened in IIVO with this answer attached.";
      mergeVisualAskDiagnostics({ handoffUrl: url, serverResult: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const fallback = await openGlassHandoffUrl(url);
      const copied = !fallback.ok && fallback.copiedToClipboard;
      state.lastNotice = copied
        ? `Could not open browser. URL copied to clipboard: ${url}`
        : `Could not open browser. Copy this URL: ${url}`;
      state.lastError = msg;
      mergeVisualAskDiagnostics({ handoffUrl: url, serverResult: "network_error", userMessage: msg });
    }
    push();
    return;
  }

  const question = item.prompt ?? item.title;
  const answer = item.fullBody ?? (item.kind === "response" ? item.body : undefined);
  const session = sessions.current();
  const summary = session ? buildSessionSummary(session) : undefined;
  const retention = state.visualAskRetention;

  let screenshotContextId =
    item.contextId ?? state.lastAskResponse?.contextId ?? state.latestScreenshot?.contextId;

  const ephemeral = state.ephemeralVisualCapture;
  if (!screenshotContextId && ephemeral?.imageDataUrl) {
    const title = `IIVO Glass · ${question.length > 60 ? `${question.slice(0, 59)}…` : question}`;
    screenshotContextId = await uploadEphemeralVisualToContext(ephemeral, title);
    if (!screenshotContextId) {
      state.lastNotice = "Could not upload screen context to IIVO. Try again or use Capture.";
      state.lastError = "Context Bridge upload failed.";
      mergeVisualAskDiagnostics({
        serverResult: "error",
        retentionResult: "not_saved",
        userMessage: "Upload failed — screenshot was not sent to IIVO.",
      });
      push();
      return;
    }
    if (state.latestScreenshot) {
      state.latestScreenshot.contextId = screenshotContextId;
      state.latestScreenshot.contextUploadStatus = "ready";
    }
    if (retention?.usedForAnswer) {
      state.visualAskRetention = buildVisualAskRetentionStatus({
        usedForAnswer: true,
        savedToSession: retention.savedToSession,
        uploadedToContext: true,
      });
      mergeVisualAskDiagnostics({ retentionResult: "uploaded_to_context" });
    }
  }

  const parts = [`Question:\n${question}`];
  if (answer) parts.push(`Answer:\n${answer}`);
  if (summary?.trim()) parts.push(`Session context:\n${summary.trim()}`);
  if (screenshotContextId) {
    parts.push(`Screenshot context id: ${screenshotContextId}`);
  }
  if (retention) {
    parts.push(
      `Retention: savedToSession=${retention.savedToSession ? "yes" : "no"}, uploadedToContext=${retention.uploadedToContext ? "yes" : "no"}`,
    );
  }
  const text =
    parts.length > 1
      ? parts.join("\n\n")
      : `Question:\n${question}\n\n(Continue this conversation in IIVO.)`;
  const payload = buildTextContextPayload({
    title: `IIVO Glass · ${question.length > 60 ? `${question.slice(0, 59)}…` : question}`,
    text,
    kind: "note",
  });

  let contextId: string;
  try {
    const created = await createContextItem(config, payload);
    contextId = created.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.lastNotice = "Could not create IIVO context for handoff.";
    state.lastError = msg;
    mergeVisualAskDiagnostics({ serverResult: "network_error", userMessage: msg });
    push();
    return;
  }

  const handoffUrl = buildLensAskUrl(config, contextId);
  state.lastSentUrl = handoffUrl;
  const opened = await openGlassHandoffUrl(handoffUrl);
  if (opened.ok) {
    state.lastNotice = screenshotContextId
      ? "Opened in IIVO with answer and screen context."
      : "Opened in IIVO with this answer attached.";
    mergeVisualAskDiagnostics({
      handoffUrl,
      serverResult: "success",
      retentionResult: screenshotContextId
        ? "uploaded_to_context"
        : retention?.savedToSession
          ? "saved_to_session"
          : "not_saved",
    });
  } else {
    state.lastNotice = opened.copiedToClipboard
      ? `Could not open browser. URL copied to clipboard: ${handoffUrl}`
      : `Could not open browser. Copy this URL: ${handoffUrl}`;
    state.lastError = opened.error;
    mergeVisualAskDiagnostics({
      handoffUrl,
      serverResult: "network_error",
      userMessage: opened.error,
    });
  }
  push();
}

function removeThinkingFeedItems(): void {
  state.commandFeed = state.commandFeed.filter((item) => item.kind !== "thinking");
}

function removeLookingFeedItems(): void {
  state.commandFeed = state.commandFeed.filter((item) => item.kind !== "looking");
}

function removePendingAskFeedItems(): void {
  state.commandFeed = state.commandFeed.filter(
    (item) => item.kind !== "thinking" && item.kind !== "looking",
  );
}

function cancelGlassAsk(): void {
  if (!state.askInFlight) return;

  askRequestGeneration += 1;
  askAbortController?.abort();
  askAbortController = null;
  thinkingStartedAtMs = null;
  lookingStartedAtMs = null;
  state.askInFlight = false;
  state.askStatus = "idle";
  state.visualAskPhase = "idle";
  removePendingAskFeedItems();
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

  let savedScreen = false;
  if (state.ephemeralVisualCapture && sessionIsLive()) {
    savedScreen = await persistEphemeralVisualToSession();
  }

  if (state.visualAskRetention?.usedForAnswer) {
    state.visualAskRetention = buildVisualAskRetentionStatus({
      usedForAnswer: true,
      savedToSession: savedScreen || state.visualAskRetention.savedToSession,
      uploadedToContext: state.visualAskRetention.uploadedToContext,
    });
  }

  pushFeed(createCommandFeedItem("moment", "Saved as a moment."));
  state.lastNotice = savedScreen
    ? "Saved answer and screen capture to session."
    : "Saved moment from IIVO answer.";
  push();
}

/**
 * Command-bar direct ask. Calls POST /api/glass/ask and renders the answer inline
 * as overlay response cards. Falls back to Context Bridge handoff on failure.
 */
async function submitCommand(rawText: string): Promise<void> {
  const text = rawText.trim();
  if (!text || state.askInFlight) return;

  // "I'm done" / debrief intents generate a Session Debrief instead of a direct ask.
  if (detectDebriefTrigger(text) && sessionIsLive()) {
    trackCopilotCommand(text);
    pushFeed(createCommandFeedItem("command", text, { prompt: text }));
    await generateCopilotDebrief();
    await persistSessions(sessions);
    push();
    return;
  }

  const requestGeneration = ++askRequestGeneration;
  askAbortController?.abort();
  askAbortController = new AbortController();
  const signal = askAbortController.signal;

  const visualIntent = promptRequestsGlassScreenVisual(text);
  state.askInFlight = true;
  state.askStatus = "pending";
  state.lastError = undefined;
  pushFeed(createCommandFeedItem("command", text, { prompt: text }));
  state.operationDiagnostics = recordOperation(state.operationDiagnostics, "ask-iivo", "pending");

  const live = sessionIsLive();
  const session = sessions.current();

  trackCopilotCommand(text);
  if (live && session) {
    sessions.addEvent({
      kind: "iivo_command",
      title: text.length > 70 ? `${text.slice(0, 69)}…` : text,
      text,
      ...eventContextFields(),
    });
    await persistSessions(sessions);
  }

  let latestScreenshot: import("../shared/glassScreenContext.ts").GlassAskLatestScreenshot | undefined;
  let visualCaptureWarning: string | undefined;
  let usedVision = false;
  let visualSavedToSession = false;
  let visualCaptureFull: { imageDataUrl: string; width: number; height: number } | null = null;
  let visualAsk413Retried = false;

  if (visualIntent) {
    state.visualAskPayloadDiagnostics = null;
    state.visualAskDiagnostics = null;

    const captureTarget = resolveCaptureDisplay(state.glassSettings.displayTarget);
    if (process.env.IIVO_GLASS_E2E === "1") {
      void refreshWindowContext();
    } else {
      await refreshWindowContext();
    }
    const preflight = await runVisualAskPreflight({
      config,
      prompt: text,
      displayId: captureTarget.id,
      displayLabel: captureTarget.label,
      hasConnectedDisplays: getConnectedDisplays().length > 0,
      windowBoundsAvailable: !!getCachedWindowContext().windowBounds,
      skipCaptureProbe:
        process.env.IIVO_GLASS_E2E === "1" && process.env.IIVO_GLASS_E2E_CAPTURE_FAIL !== "1",
      signal,
    });

    if (!preflight.ok) {
      if (preflight.code === "capture_permission" && preflight.screenProbe) {
        state.screenCaptureProbe = preflight.screenProbe.status;
        state.screenCaptureDetail = preflight.message;
      }
      state.askInFlight = false;
      state.askStatus = "error";
      state.visualAskPhase = "idle";
      const userMessage =
        preflight.code === "capture_permission" && state.duplicateAppWarning
          ? `${preflight.message} ${state.duplicateAppWarning}`
          : preflight.message;
      mergeVisualAskDiagnostics({
        phase: "idle",
        displayLabel: captureTarget.label,
        displayId: captureTarget.id,
        serverResult: preflightCodeToServerResult(preflight.code),
        lastPreflightIssue: preflight.message,
        userMessage,
        ...visualAskProbeDiagnostics(preflight.screenProbe),
      });
      pushFeed(createCommandFeedItem("error", userMessage, { prompt: text }));
      state.lastError = userMessage;
      state.operationDiagnostics = recordOperation(
        state.operationDiagnostics,
        "ask-iivo",
        "error",
        preflight.code,
      );
      push();
      return;
    }

    state.screenCaptureProbe = preflight.screenProbe.status;
    state.screenCaptureDetail = undefined;
    const visualAskScreenProbe = preflight.screenProbe;

    const qualityPreset = chooseVisualQualityPreset(text);
    mergeVisualAskDiagnostics({
      phase: "looking",
      displayLabel: captureTarget.label,
      displayId: captureTarget.id,
      qualityPreset,
      userMessage: [
        visualAskUserMessageForFrame("screen", captureTarget.label),
        qualityPreset === "text" ? "Using text clarity mode." : undefined,
      ]
        .filter(Boolean)
        .join(" "),
      ...visualAskProbeDiagnostics(visualAskScreenProbe),
    });

    state.visualAskPhase = "looking";
    lookingStartedAtMs = Date.now();
    pushFeed(
      createCommandFeedItem("looking", "IIVO is looking at your screen…", {
        title: "IIVO is looking",
      }),
    );
    push();

    const captureOutcome = await resolveScreenshotForVisualAsk({
      config,
      glassSettings: state.glassSettings,
      sessions,
      sessionIsLive,
      latestScreenshot: state.latestScreenshot,
      pendingCaptureDataUrl: state.pendingCaptureDataUrl,
      resolveCaptureTarget: () => resolveCaptureDisplay(state.glassSettings.displayTarget),
      eventContextFields,
      prompt: text,
      onOptimizing: () => {
        state.visualAskPhase = "optimizing";
        removeLookingFeedItems();
        pushFeed(
          createCommandFeedItem("looking", "Optimizing screen image…", {
            title: "IIVO",
          }),
        );
        push();
      },
    });

    state.visualAskPhase = "idle";

    if (requestGeneration !== askRequestGeneration || signal.aborted) return;

    if (!captureOutcome.ok) {
      removeLookingFeedItems();
      state.askInFlight = false;
      state.askStatus = "error";
      const captureError =
        visualAskScreenProbe.ready
          ? DUPLICATE_APP_CAPTURE_FAILURE_MESSAGE
          : captureOutcome.error;
      if (!visualAskScreenProbe.ready) {
        state.screenCaptureProbe = mapCaptureErrorToScreenCaptureStatus(captureOutcome.error);
        state.screenCaptureDetail = captureOutcome.error;
      }
      mergeVisualAskDiagnostics({
        phase: "idle",
        serverResult: visualAskScreenProbe.ready ? "error" : "capture_permission",
        userMessage: captureError,
        ...visualAskProbeDiagnostics(visualAskScreenProbe),
      });
      pushFeed(createCommandFeedItem("error", captureError, { prompt: text }));
      state.lastError = captureError;
      state.operationDiagnostics = recordOperation(
        state.operationDiagnostics,
        "ask-iivo",
        "error",
        "capture_failed",
      );
      refreshSetupCapabilities();
      push();
      return;
    }

    state.latestScreenshot = captureOutcome.latestState;
    latestScreenshot = captureOutcome.payload;
    visualCaptureWarning = captureOutcome.warning;
    usedVision = true;
    state.visualAskPayloadDiagnostics = captureOutcome.payloadDiagnostics ?? null;
    if (captureOutcome.payloadDiagnostics) {
      const statusMessages = buildVisualAskStatusMessages(
        captureOutcome.latestState.displayLabel ?? captureTarget.label,
        captureOutcome.payloadDiagnostics,
      );
      mergeVisualAskDiagnostics(
        visualDiagnosticsFromPayload(captureOutcome.payloadDiagnostics, {
          displayLabel: captureOutcome.latestState.displayLabel ?? captureTarget.label,
          displayId: captureOutcome.latestState.displayId ?? captureTarget.id,
          retentionResult: captureOutcome.savedToSession ? "saved_to_session" : "not_saved",
          userMessage: statusMessages.join(" "),
        }),
      );
      if (statusMessages.length) {
        state.lastNotice = statusMessages[statusMessages.length - 1];
      }
    }
    visualCaptureFull = {
      imageDataUrl: captureOutcome.imageDataUrl,
      width: captureOutcome.captureWidth,
      height: captureOutcome.captureHeight,
    };

    visualSavedToSession = captureOutcome.savedToSession;
    if (captureOutcome.savedToSession) {
      state.pendingCaptureDataUrl = captureOutcome.imageDataUrl;
      if (live && sessionIsLive()) {
        await persistSessions(sessions);
      }
    } else {
      setEphemeralVisualCapture({
        imageDataUrl: captureOutcome.imageDataUrl,
        displayLabel: captureOutcome.latestState.displayLabel,
        displayId: captureOutcome.latestState.displayId,
        sourceTitle: captureOutcome.latestState.sourceTitle,
        sessionId: captureOutcome.latestState.sessionId,
        eventId: captureOutcome.eventId,
      });
    }
  }

  if (visualIntent) {
    if (lookingStartedAtMs != null) {
      await waitForMinLookingDuration(lookingStartedAtMs);
      lookingStartedAtMs = null;
    }
    removeLookingFeedItems();
  }
  if (visualIntent) {
    state.visualAskPhase = "analyzing";
    push();
  }

  thinkingStartedAtMs = Date.now();
  pushFeed(
    createCommandFeedItem(
      "thinking",
      visualIntent ? "Analyzing screen…" : "IIVO is thinking…",
    ),
  );
  push();

  const runGlassAsk = async (): Promise<import("../shared/glassAskTypes.ts").GlassAskResponse> =>
    askIivoGlass(
      config,
      {
        prompt: text,
        session: buildGlassAskSessionPayload(),
        latestScreenshot,
        visualIntent: visualIntent || undefined,
        responseStyle: "overlay",
      },
      signal,
    );

  try {
    let result = await runGlassAsk();

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
    trackCopilotResponse(fullAnswer);
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

    const responseWarnings = [
      ...(visualCaptureWarning ? [visualCaptureWarning] : []),
      ...(result.warnings ?? []),
    ];
    pushFeed(
      createCommandFeedItem("response", overlayAnswer, {
        prompt: text,
        fullBody: fullAnswer,
        runId: result.runId,
        contextId: result.contextId,
      }),
    );
    if (visualIntent && usedVision) {
      state.visualAskRetention = buildVisualAskRetentionStatus({
        usedForAnswer: true,
        savedToSession: visualSavedToSession,
        uploadedToContext: false,
      });

      if (shouldDiscardEphemeralAfterAsk(state.glassSettings, !!live, visualSavedToSession)) {
        state.pendingCaptureDataUrl = undefined;
      }
    }

    if (responseWarnings.length) {
      state.lastNotice = responseWarnings[0];
    } else if (state.visualAskRetention?.detail) {
      state.lastNotice = `${state.visualAskRetention.label} · ${state.visualAskRetention.detail}`;
    }

    if (live && session) {
      sessions.addEvent({
        kind: "iivo_response",
        title: "IIVO response",
        text: fullAnswer,
        importance: "high",
        ...eventContextFields(),
        metadata: {
          routeUsed: result.routeUsed,
          model: result.model,
          usedVision: usedVision || result.usedVision === true,
          ...(latestScreenshot?.eventId
            ? {
                usedScreenshotEventId: latestScreenshot.eventId,
                usedScreenshotCapturedAt: latestScreenshot.capturedAt,
              }
            : {}),
          ...(latestScreenshot?.displayId != null
            ? { displayId: latestScreenshot.displayId }
            : {}),
        },
      });
      await persistSessions(sessions);
    }

    if (!state.lastNotice || state.lastNotice.startsWith("IIVO answered")) {
      state.lastNotice = live
        ? "IIVO answered inline. Saved to session."
        : visualIntent && state.visualAskRetention
          ? `${state.visualAskRetention.label} · ${state.visualAskRetention.detail ?? "Not saved"}`
          : "IIVO answered inline. Start a session to save this context.";
    }
    state.operationDiagnostics = recordOperation(state.operationDiagnostics, "ask-iivo", "ok");
    if (visualIntent) copilotVisualAskFailures = 0;
    if (visualIntent && state.visualAskPayloadDiagnostics) {
      mergeVisualAskDiagnostics({
        phase: "idle",
        serverResult: "success",
        retentionResult: visualSavedToSession ? "saved_to_session" : "not_saved",
      });
    }
    state.visualAskPhase = "idle";
  } catch (err) {
    if (requestGeneration !== askRequestGeneration || signal.aborted || err instanceof GlassAskCancelledError) {
      return;
    }

    if (visualIntent) copilotVisualAskFailures += 1;

    if (
      visualIntent &&
      !visualAsk413Retried &&
      visualCaptureFull &&
      latestScreenshot &&
      isGlassAskPayloadTooLargeError(err)
    ) {
      visualAsk413Retried = true;
      state.lastNotice = GLASS_VISUAL_PAYLOAD_RETRY_MESSAGE;
      state.visualAskPhase = "optimizing";
      push();

      const captureTarget = resolveCaptureDisplay(state.glassSettings.displayTarget);
      const aggressive = optimizeVisualAskImage(
        visualCaptureFull.imageDataUrl,
        { width: visualCaptureFull.width, height: visualCaptureFull.height },
        {
          preset: "aggressive",
          prompt: text,
          retry: true,
          displayId: captureTarget.id,
          windowBounds: getCachedWindowContext().windowBounds,
        },
      );
      latestScreenshot = applyOptimizedToPayload(latestScreenshot, aggressive);
      const retryDiag: VisualAskPayloadDiagnostics = {
        originalWidth: aggressive.originalWidth,
        originalHeight: aggressive.originalHeight,
        originalSizeBytes: aggressive.originalSizeBytes,
        optimizedWidth: aggressive.optimizedWidth,
        optimizedHeight: aggressive.optimizedHeight,
        optimizedSizeBytes: aggressive.optimizedSizeBytes,
        optimizedMimeType: aggressive.mimeType,
        compressionApplied: aggressive.compressionApplied,
        status: "retry",
        visualFrameMode: aggressive.visualFrameMode,
        cropBounds: aggressive.cropBounds,
        qualityPreset: aggressive.qualityPreset,
      };
      state.visualAskPayloadDiagnostics = retryDiag;
      mergeVisualAskDiagnostics(
        visualDiagnosticsFromPayload(retryDiag, {
          retryUsed: true,
          serverResult: "idle",
          userMessage: `${GLASS_VISUAL_PAYLOAD_RETRY_MESSAGE} Optimized screen image to ${formatBytesShort(aggressive.optimizedSizeBytes)}.`,
        }),
      );
      state.visualAskPhase = "analyzing";
      push();

      try {
        const retryResult = await runGlassAsk();
        if (requestGeneration !== askRequestGeneration) return;

        if (thinkingStartedAtMs != null) {
          await waitForMinThinkingDuration(thinkingStartedAtMs);
          thinkingStartedAtMs = null;
        }
        removeThinkingFeedItems();
        state.askStatus = "done";
        const overlayAnswer = retryResult.shortAnswer ?? retryResult.answer;
        state.lastAskResponse = {
          prompt: text,
          answer: overlayAnswer,
          fullAnswer: retryResult.answer,
          shortAnswer: retryResult.shortAnswer,
          runId: retryResult.runId,
          contextId: retryResult.contextId,
          at: new Date().toISOString(),
          routeUsed: retryResult.routeUsed,
          model: retryResult.model,
        };
        pushFeed(
          createCommandFeedItem("response", overlayAnswer, {
            prompt: text,
            fullBody: retryResult.answer,
            runId: retryResult.runId,
            contextId: retryResult.contextId,
          }),
        );
        if (usedVision) {
          state.visualAskRetention = buildVisualAskRetentionStatus({
            usedForAnswer: true,
            savedToSession: visualSavedToSession,
            uploadedToContext: false,
          });
        }
        state.visualAskPhase = "idle";
        mergeVisualAskDiagnostics({ serverResult: "success", phase: "idle" });
        state.operationDiagnostics = recordOperation(state.operationDiagnostics, "ask-iivo", "ok");
        push();
        return;
      } catch (retryErr) {
        if (requestGeneration !== askRequestGeneration || signal.aborted || retryErr instanceof GlassAskCancelledError) {
          return;
        }
        err = retryErr;
      }
    }

    removePendingAskFeedItems();
    const rawMessage = err instanceof Error ? err.message : "Could not reach IIVO server.";
    const message = isGlassAskPayloadTooLargeError(err)
      ? GLASS_VISUAL_PAYLOAD_TOO_LARGE_MESSAGE
      : rawMessage;
    state.visualAskPayloadDiagnostics = state.visualAskPayloadDiagnostics
      ? { ...state.visualAskPayloadDiagnostics, status: "failed" }
      : null;
    const serverResult = isGlassAskPayloadTooLargeError(err)
      ? "413"
      : /vision|not enabled|not configured/i.test(rawMessage)
        ? "vision_unavailable"
        : /fetch|network|econnrefused|unavailable/i.test(rawMessage)
          ? "network_error"
          : "error";
    mergeVisualAskDiagnostics({
      phase: "idle",
      serverResult,
      userMessage: message,
    });
    state.visualAskPhase = "idle";
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
      state.visualAskPhase = "idle";
      askAbortController = null;
      if (state.askStatus === "pending") state.askStatus = "idle";
      push();
    }
  }
}

async function handleCommand(
  command: GlassCommand,
  sender?: WebContents,
): Promise<void> {
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
      resetListeningLimitTracking();
      state.operationDiagnostics = diagnosticsForListening(
        recordOperation(state.operationDiagnostics, "start-listening", "ok"),
        state.transcriptionMode,
        state.stt,
      );
      maybeOfferCopilotForSystemAudio();
      push();
      return;
    case "pause":
      broadcastTranscriptionControl({ type: "stop" });
      dispatchPrivacy({ type: "PAUSE", at: new Date().toISOString() });
      state.stt = { ...state.stt, listeningElapsedMs: 0 };
      resetListeningLimitTracking();
      state.operationDiagnostics = recordOperation(state.operationDiagnostics, "pause", "ok");
      if (command.reason !== "user") {
        state.lastNotice = MIC_PAUSED_AUTO_MESSAGE;
      }
      push();
      return;
    case "stop":
    case "stop-everything": {
      cancelGlassAsk();
      state.visualAskPhase = "idle";
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
      stopCopilotLoop();
      resetListeningLimitTracking();
      systemAudioLastSignalMs = undefined;
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
      if (command.tags?.includes("system_audio")) {
        systemAudioLastSignalMs = Date.now();
      }
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
      if (command.status === "requires_virtual_device" || command.status === "available") {
        state.nativeLoopbackTested = true;
      }
      refreshSetupCapabilities();
      push();
      return;
    case "report-virtual-audio-devices":
      state.virtualAudioDevices = detectVirtualAudioDevices(command.devices);
      if (
        state.selectedVirtualAudioDeviceId &&
        !state.virtualAudioDevices.some((d) => d.deviceId === state.selectedVirtualAudioDeviceId)
      ) {
        state.selectedVirtualAudioDeviceId = undefined;
        glassUserSettings = {
          ...glassUserSettings,
          selectedVirtualAudioDeviceId: undefined,
        };
        state.glassSettings = glassUserSettings;
        void persistGlassUserSettings(glassUserSettings);
      }
      refreshSetupCapabilities();
      push();
      return;
    case "set-selected-virtual-audio-device": {
      const deviceId = command.deviceId.trim() || undefined;
      state.selectedVirtualAudioDeviceId = deviceId;
      glassUserSettings = { ...glassUserSettings, selectedVirtualAudioDeviceId: deviceId };
      state.glassSettings = glassUserSettings;
      await persistGlassUserSettings(glassUserSettings);
      refreshSetupCapabilities();
      push();
      return;
    }
    case "stt-listening-timer":
      state.stt = { ...state.stt, listeningElapsedMs: command.elapsedMs };
      checkListeningLimit(command.elapsedMs);
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
    case "set-save-visual-asks-to-session":
      state.glassSettings = {
        ...state.glassSettings,
        saveVisualAsksToSession: command.enabled,
      };
      glassUserSettings = state.glassSettings;
      await persistGlassUserSettings(glassUserSettings);
      push();
      return;
    case "set-auto-upload-captures-to-context":
      state.glassSettings = {
        ...state.glassSettings,
        autoUploadCapturesToContext: command.enabled,
      };
      glassUserSettings = state.glassSettings;
      await persistGlassUserSettings(glassUserSettings);
      push();
      return;
    case "set-mic-auto-send-after-silence":
      state.glassSettings = {
        ...state.glassSettings,
        micAutoSendAfterSilence: command.enabled,
      };
      glassUserSettings = state.glassSettings;
      await persistGlassUserSettings(glassUserSettings);
      push();
      return;
    case "save-last-visual-capture": {
      if (!sessionIsLive()) {
        state.lastNotice = "Start a session to save the screen capture.";
        push();
        break;
      }
      const saved = await persistEphemeralVisualToSession();
      if (saved && state.visualAskRetention?.usedForAnswer) {
        state.visualAskRetention = buildVisualAskRetentionStatus({
          usedForAnswer: true,
          savedToSession: true,
          uploadedToContext: state.visualAskRetention.uploadedToContext,
        });
        state.lastNotice = "Screen capture saved to session.";
      } else if (!state.ephemeralVisualCapture) {
        state.lastNotice = "No recent screen capture to save.";
      } else {
        state.lastNotice = "Could not save screen capture.";
      }
      push();
      return;
    }
    case "refresh-glass-layout":
      refreshGlassDisplayLayout();
      push();
      return;
    case "chrome-window-drag": {
      if (sender) {
        nudgeChromeWindowFromWebContents(sender, command.dx, command.dy);
      }
      return;
    }
    case "set-chrome-layout-locked": {
      if (command.locked) {
        const origins = lockChromeLayout();
        glassUserSettings = {
          ...glassUserSettings,
          chromeLayoutLocked: true,
          dockCustomOrigin: origins.dockCustomOrigin,
          commandBarCustomOrigin: origins.commandBarCustomOrigin,
        };
      } else {
        glassUserSettings = { ...glassUserSettings, chromeLayoutLocked: false };
        unlockChromeLayout();
      }
      syncChromeLayoutFromSettings(glassUserSettings);
      state.glassSettings = glassUserSettings;
      await persistGlassUserSettings(glassUserSettings);
      push();
      return;
    }
    case "set-dock-orientation": {
      glassUserSettings = { ...glassUserSettings, dockOrientation: command.orientation };
      state.glassSettings = glassUserSettings;
      await persistGlassUserSettings(glassUserSettings);
      push();
      return;
    }
    case "reset-chrome-layout": {
      resetChromeLayoutOrigins();
      glassUserSettings = {
        ...glassUserSettings,
        chromeLayoutLocked: true,
        dockCustomOrigin: null,
        commandBarCustomOrigin: null,
      };
      state.glassSettings = glassUserSettings;
      await persistGlassUserSettings(glassUserSettings);
      syncChromeLayoutFromSettings(glassUserSettings);
      push();
      return;
    }
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
    case "report-mic-permission":
      state.micPermission = command.status;
      refreshSetupCapabilities();
      push();
      return;
    case "run-setup-check":
    case "retry-system-audio": {
      const result = await runGlassSetupCheck({
        config,
        displayTarget: state.glassSettings.displayTarget,
        skipCaptureProbe:
          process.env.IIVO_GLASS_E2E === "1" && process.env.IIVO_GLASS_E2E_CAPTURE_FAIL !== "1",
      });
      state.serverHealthForSetup = result.serverHealth;
      state.screenCaptureProbe = result.screenCaptureProbe;
      state.screenCaptureDetail = result.screenCaptureDetail;
      state.windowCaptureProbe = result.windowCaptureProbe;
      state.windowCaptureDetail = result.windowCaptureDetail;
      if (!state.privacy.listening && process.env.IIVO_GLASS_E2E !== "1") {
        state.systemAudioStatus = result.systemAudioStatus;
        state.systemAudioDetail = result.systemAudioDetail;
      }
      refreshSetupCapabilities();
      state.setupCheckSummary = formatSetupCheckSummary(state.setupCapabilities);
      state.lastNotice =
        command.type === "retry-system-audio"
          ? `System audio probe: ${result.systemAudioStatus}${result.systemAudioDiagnostics ? ` (${result.systemAudioDiagnostics})` : ""}`
          : state.setupCheckSummary;
      push();
      return;
    }
    case "run-capture-diagnostics": {
      refreshAppIdentityState();
      const report = await runCaptureDiagnosticsReport({
        displayTarget: state.glassSettings.displayTarget,
      });
      state.captureDiagnosticsReport = report;
      state.duplicateAppBundles = report.duplicateAppBundles;
      state.duplicateAppWarning = buildDuplicateAppWarning(
        report.duplicateAppBundles,
        report.appIdentity.bundlePath,
      );
      state.screenCaptureProbe = report.screenCaptureProbe;
      state.screenCaptureDetail = report.screenCaptureDetail;
      state.windowCaptureProbe = report.windowCaptureProbe;
      state.windowCaptureDetail = report.windowCaptureDetail;
      if (!state.privacy.listening) {
        state.systemAudioStatus = report.systemAudioStatus;
        state.systemAudioDetail = report.systemAudioDetail;
      }
      refreshSetupCapabilities();
      state.setupCheckSummary = formatSetupCheckSummary(state.setupCapabilities);
      state.lastNotice = report.lines.join("\n");
      push();
      return;
    }
    case "open-screen-recording-settings": {
      const opened = await openGlassSystemSettings("screenRecording");
      state.lastNotice = opened.message;
      push();
      return;
    }
    case "open-microphone-settings": {
      const opened = await openGlassSystemSettings("microphone");
      state.lastNotice = opened.message;
      push();
      return;
    }
    case "open-privacy-settings": {
      const opened = await openGlassSystemSettings("privacy");
      state.lastNotice = opened.message;
      push();
      return;
    }
    case "open-audio-midi-setup": {
      const opened = await openGlassSystemSettings("audioMidi");
      state.lastNotice = opened.message;
      push();
      return;
    }
    case "show-virtual-audio-help":
      state.lastNotice = VIRTUAL_AUDIO_HELP_DETAIL;
      push();
      return;
    case "show-blackhole-setup":
      state.lastNotice = BLACKHOLE_SETUP_INSTRUCTIONS;
      push();
      return;
    case "detect-audio-devices":
      broadcastTranscriptionControl({ type: "probe-virtual-audio-devices" });
      state.lastNotice = "Scanning for virtual audio devices (BlackHole, Loopback, etc.)…";
      push();
      return;
    case "test-blackhole":
      broadcastTranscriptionControl({ type: "test-blackhole" });
      state.lastNotice = "Testing BlackHole input — play audio on your Mac while the test runs.";
      push();
      return;
    case "open-sound-settings": {
      const opened = await openGlassSystemSettings("sound");
      state.lastNotice = opened.message;
      push();
      return;
    }
    case "retry-capture":
    case "retry-capture-permission": {
      const target = resolveCaptureDisplay(state.glassSettings.displayTarget);
      const probe = await import("./capture.ts").then((m) =>
        m.probeScreenCapturePermission(target.id),
      );
      if (probe.ok) {
        state.screenCaptureProbe = "ready";
        state.screenCaptureDetail = undefined;
        state.lastNotice = "Screen capture permission looks good. Try Capture Screen or a visual ask.";
      } else {
        state.screenCaptureProbe = mapCaptureErrorToScreenCaptureStatus(probe.error);
        state.screenCaptureDetail = probe.error;
        state.lastNotice = "Screen Recording permission still needed.";
      }
      refreshSetupCapabilities();
      push();
      return;
    }
    case "test-microphone":
      state.panelTab = "context";
      if (!isPanelVisible()) togglePanel();
      broadcastTranscriptionControl({ type: "probe-microphone" });
      state.lastNotice = "Testing microphone — approve the macOS prompt if shown.";
      push();
      return;
    case "test-system-audio":
      state.panelTab = "context";
      if (!isPanelVisible()) togglePanel();
      broadcastTranscriptionControl({ type: "test-system-audio" });
      state.lastNotice =
        "Testing system audio — choose the screen in the picker if prompted.";
      push();
      return;
    case "e2e-set-server-health":
      if (process.env.IIVO_GLASS_E2E === "1") {
        state.serverHealthForSetup = command.health;
        push();
      }
      return;
    case "e2e-set-capture-probes":
      if (process.env.IIVO_GLASS_E2E === "1") {
        if (command.screenCaptureProbe) state.screenCaptureProbe = command.screenCaptureProbe;
        if (command.screenCaptureDetail !== undefined) {
          state.screenCaptureDetail = command.screenCaptureDetail;
        }
        if (command.windowCaptureProbe) state.windowCaptureProbe = command.windowCaptureProbe;
        if (command.systemAudioStatus) state.systemAudioStatus = command.systemAudioStatus;
        if (command.systemAudioDetail !== undefined) {
          state.systemAudioDetail = command.systemAudioDetail;
        }
        refreshSetupCapabilities();
        state.setupCheckSummary = formatSetupCheckSummary(state.setupCapabilities);
        push();
      }
      return;
    default:
      if (await handleCopilotCommand(command)) return;
      await handleSessionCommand(command);
      return;
  }
}

function persistCopilotConfig(config: GlassCopilotConfig): void {
  glassUserSettings = { ...glassUserSettings, copilot: config };
  state.glassSettings = glassUserSettings;
  copilot.setConfig(config);
  void persistGlassUserSettings(glassUserSettings);
}

/** Build a deterministic debrief, optionally enriched by a direct (non-Council) AI pass. */
async function maybeSemanticRefineForDebrief(): Promise<void> {
  if (copilot.isSessionTypeRefined()) return;
  const windowCtx = getCachedWindowContext();
  const signals = {
    appName: windowCtx.appName,
    windowTitle: windowCtx.windowTitle,
    transcript: state.transcript,
    recentCommands: copilotRecentCommands,
  };
  if (
    !canSemanticRefineOnDebrief({
      setting: copilot.getConfig().sessionType,
      detection: copilot.getSessionTypeDetection(),
      alreadyRefined: copilot.isSessionTypeRefined(),
      signals,
    })
  ) {
    return;
  }
  await refineSessionTypeSemantic();
}

async function refineSessionTypeSemantic(): Promise<void> {
  if (!sessionIsLive()) return;
  const windowCtx = getCachedWindowContext();
  const signals = {
    appName: windowCtx.appName,
    windowTitle: windowCtx.windowTitle,
    transcript: state.transcript,
    recentCommands: copilotRecentCommands,
  };
  const detection = copilot.getSessionTypeDetection();
  copilot.setSessionTypeRefining(true);
  push();
  try {
    if (process.env.IIVO_GLASS_E2E === "1") {
      state.lastNotice = "Session type refine skipped in E2E.";
      return;
    }
    const prompt = buildSemanticSessionTypePrompt(signals, detection);
    const response = await askIivoGlass(config, {
      prompt,
      session: buildGlassAskSessionPayload(),
      responseStyle: "overlay",
    });
    const parsed = parseSemanticSessionTypeResponse(response.answer);
    if (parsed) {
      copilot.applySemanticClassification(parsed);
      state.lastNotice = `Session type refined: ${SESSION_TYPE_LABELS[parsed.primaryType]}.`;
    } else {
      state.lastNotice = "Could not refine session type — keeping auto detection.";
    }
  } catch {
    state.lastNotice = "Session type refine unavailable — keeping auto detection.";
  } finally {
    copilot.setSessionTypeRefining(false);
    syncCopilotToSession();
    await persistSessions(sessions);
    push();
  }
}

async function runCopilotDiagnosis(resolution: CopilotResolution): Promise<void> {
  const packet = resolution.intervention?.diagnosticPacket;
  if (!packet) {
    state.lastNotice = "No diagnostic context available.";
    return;
  }
  const idFactory = () => {
    try {
      if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    } catch {
      /* ignore */
    }
    return `diag-${Date.now()}`;
  };
  const id = idFactory();
  const createdAt = new Date().toISOString();
  const windowCtx = getCachedWindowContext();
  const analysisContext = {
    transcript: state.transcript,
    recentCommands: [...copilotRecentCommands],
    recentResponses: [...copilotRecentResponses],
    sourceApp: windowCtx.appName,
    sourceTitle: windowCtx.windowTitle,
  };

  copilot.setDiagnosticAnalyzing(true);
  push();

  let result;
  try {
    if (process.env.IIVO_GLASS_E2E === "1") {
      result = buildDeterministicDiagnosticFallback(packet, id, createdAt);
    } else {
      const prompt = buildDiagnosticAnalysisPrompt(packet, analysisContext);
      let latestScreenshotPayload: import("../shared/glassAskTypes.ts").GlassAskLatestScreenshot | undefined;
      try {
        const captureOutcome = await resolveScreenshotForVisualAsk({
          config,
          glassSettings: state.glassSettings,
          sessions,
          sessionIsLive,
          latestScreenshot: state.latestScreenshot,
          pendingCaptureDataUrl: state.pendingCaptureDataUrl,
          resolveCaptureTarget: () => resolveCaptureDisplay(state.glassSettings.displayTarget),
          eventContextFields,
          prompt,
        });
        if (captureOutcome.ok) {
          latestScreenshotPayload = captureOutcome.payload;
          state.latestScreenshot = captureOutcome.latestState;
        }
      } catch {
        /* screenshot optional */
      }
      const response = await askIivoGlass(config, {
        prompt,
        session: buildGlassAskSessionPayload(),
        latestScreenshot: latestScreenshotPayload,
        visualIntent: true,
        responseStyle: "overlay",
      });
      result = parseDiagnosticAnalysisResponse(response.answer, id, createdAt);
    }
  } catch {
    result = buildDeterministicDiagnosticFallback(packet, id, createdAt);
  }

  copilot.setDiagnosticResult(result);
  copilot.setDiagnosticAnalyzing(false);

  if (sessionIsLive()) {
    sessions.addEvent({
      kind: "copilot_diagnostic_result",
      title: result.rootCauseSummary,
      text: result.fullMarkdown,
      ...eventContextFields(),
      metadata: {
        diagnosticId: result.id,
        aiEnhanced: result.aiEnhanced,
        probableRootCause: result.probableRootCause,
      },
    });
    pushFeed(
      createCommandFeedItem("response", result.rootCauseSummary, {
        title: "Diagnostic result",
        fullBody: result.fullMarkdown,
      }),
    );
  }
  syncCopilotToSession();
  await persistSessions(sessions);
  state.lastNotice = result.aiEnhanced ? "Diagnostic complete." : "Diagnostic summary (offline fallback).";
  push();
}

/** Build a deterministic debrief, optionally enriched by a direct (non-Council) AI pass. */
async function generateCopilotDebrief(): Promise<void> {
  await maybeSemanticRefineForDebrief();
  const session = sessions.current();
  if (!session) {
    state.lastNotice = "No session to debrief.";
    return;
  }
  const idFactory = () => {
    try {
      if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    } catch {
      /* ignore */
    }
    return `debrief-${Date.now()}`;
  };
  const debriefOptions = {
    sessionType: copilot.getSessionType(),
    sessionTypeDetection: copilot.getSessionTypeDetection(),
    reportStyle: copilot.getConfig().reportStyle,
  };
  const debrief = buildSessionDebrief(
    session,
    copilot.getInsights(),
    { idFactory, clock: () => new Date().toISOString() },
    debriefOptions,
  );

  // Optional direct-AI enrichment (never Council). Best-effort; deterministic on
  // failure. Skipped under E2E so the deterministic debrief stays assertable.
  if (process.env.IIVO_GLASS_E2E !== "1") {
    try {
      const aiPrompt = buildDebriefAiPrompt(session, copilot.getInsights(), debriefOptions);
      const response = await askIivoGlass(config, {
        prompt: aiPrompt,
        session: buildGlassAskSessionPayload(),
        responseStyle: "overlay",
      });
      if (response.answer?.trim()) {
        debrief.markdown = response.answer.trim();
        debrief.aiEnhanced = true;
      }
    } catch {
      // keep deterministic debrief
    }
  }

  copilot.setDebrief(debrief);
  syncCopilotToSession();
  pushFeed(
    createCommandFeedItem("response", debrief.markdown, {
      title: "Session Debrief",
      fullBody: debrief.markdown,
    }),
  );
  state.lastNotice = "Session debrief ready.";
}

async function maybeAutoDebriefOnEnd(): Promise<void> {
  const cfg = copilot.getConfig();
  if (!cfg.autoDebriefOnEnd || !copilotModeIsActive(cfg.mode)) return;
  await generateCopilotDebrief();
}

/** Handle copilot-* commands. Returns true when the command was a copilot command. */
async function handleCopilotCommand(command: GlassCommand): Promise<boolean> {
  switch (command.type) {
    case "copilot-set-mode": {
      const next = withCopilotConfig(copilot.getConfig(), { mode: command.mode });
      persistCopilotConfig(next);
      copilot.setOffer(null);
      copilotOffered = true;
      if (copilotModeIsActive(next.mode) && sessionIsLive()) {
        bindCopilotToSession();
        refreshCopilotLoop();
      } else {
        stopCopilotLoop();
      }
      push();
      return true;
    }
    case "copilot-set-config": {
      const next = withCopilotConfig(copilot.getConfig(), command.patch);
      persistCopilotConfig(next);
      refreshCopilotLoop();
      push();
      return true;
    }
    case "copilot-set-muted": {
      const next = withCopilotConfig(copilot.getConfig(), { muteSuggestions: command.muted });
      persistCopilotConfig(next);
      push();
      return true;
    }
    case "copilot-accept-offer": {
      const next = withCopilotConfig(copilot.getConfig(), { mode: command.mode });
      persistCopilotConfig(next);
      copilot.setOffer(null);
      copilotOffered = true;
      if (sessionIsLive()) {
        bindCopilotToSession();
        refreshCopilotLoop();
      }
      push();
      return true;
    }
    case "copilot-dismiss-offer": {
      copilot.setOffer(null);
      copilotOffered = true;
      push();
      return true;
    }
    case "copilot-card-action": {
      const resolution = copilot.resolveIntervention(command.id, command.action);
      await applyCopilotEffect(resolution);
      copilot.clearIntervention(command.id);
      syncCopilotToSession();
      await persistSessions(sessions);
      push();
      return true;
    }
    case "copilot-generate-debrief":
      await generateCopilotDebrief();
      await persistSessions(sessions);
      push();
      return true;
    case "copilot-dismiss-debrief":
      copilot.setDebrief(null);
      syncCopilotToSession();
      await persistSessions(sessions);
      push();
      return true;
    case "copilot-open-debrief-in-iivo": {
      const debrief = copilot.getDebrief();
      const session = sessions.current();
      if (debrief && session) {
        await sendSessionText(`IIVO Glass Session Debrief — ${session.title}`, debrief.markdown);
      }
      return true;
    }
    case "copilot-dismiss-silence-warning":
      push();
      return true;
    case "copilot-pause-system-audio":
      broadcastTranscriptionControl({ type: "stop" });
      dispatchPrivacy({ type: "PAUSE", at: new Date().toISOString() });
      systemAudioLastSignalMs = undefined;
      resetListeningLimitTracking();
      state.lastNotice = "System listening paused.";
      push();
      return true;
    case "copilot-listening-limit-continue":
      listeningLimitState = extendListeningLimit(listeningLimitState);
      clearListeningLimitAutoStopTimer();
      push();
      return true;
    case "copilot-listening-limit-stop":
      await stopListeningFromLimit("user");
      return true;
    case "copilot-refine-session-type":
      await refineSessionTypeSemantic();
      return true;
    case "copilot-dismiss-diagnostic-result":
      copilot.setDiagnosticResult(null);
      syncCopilotToSession();
      push();
      return true;
    case "copilot-open-diagnostic-in-iivo": {
      const diagnostic = copilot.getDiagnosticResult();
      if (diagnostic) {
        await sendSessionText("IIVO Glass Diagnostic", diagnostic.fullMarkdown);
      }
      return true;
    }
    case "copilot-save-diagnostic-result": {
      const diagnostic = copilot.getDiagnosticResult();
      if (diagnostic) {
        moments.add({ kind: "note", note: diagnostic.fullMarkdown });
        await persistMoments(moments);
        if (sessionIsLive()) {
          sessions.addEvent({
            kind: "saved_moment",
            title: "Saved diagnostic",
            text: diagnostic.rootCauseSummary,
          });
        }
        state.lastNotice = "Saved diagnostic to moments.";
        await persistSessions(sessions);
        push();
      }
      return true;
    }
    default:
      return false;
  }
}

/** Execute the side effect of a resolved copilot card. */
async function applyCopilotEffect(
  resolution: import("../shared/copilotController.ts").CopilotResolution,
): Promise<void> {
  const { effect, insight } = resolution;
  const windowCtx = getCachedWindowContext();
  const usingCursor = `${windowCtx.appName ?? ""} ${windowCtx.windowTitle ?? ""}`
    .toLowerCase()
    .includes("cursor");
  const promptNoun = usingCursor ? "Cursor prompt" : "AI prompt";
  switch (effect) {
    case "cursor_prompt":
      if (insight) {
        pushFeed(
          createCommandFeedItem("response", insight.text, {
            title: `${promptNoun} candidate`,
            prompt: insight.text,
            fullBody: insight.text,
          }),
        );
        state.lastNotice = `Saved as a ${promptNoun} candidate.`;
      }
      break;
    case "action_steps":
      if (insight) {
        const body = `Next steps from “${insight.title}”:\n${insight.text}`;
        pushFeed(
          createCommandFeedItem("response", body, {
            title: "Action items",
            fullBody: body,
          }),
        );
        moments.add({ kind: "note", note: `Action: ${insight.text}` });
        await persistMoments(moments);
        if (sessionIsLive()) sessions.addEvent({ kind: "saved_moment", title: insight.title });
        state.lastNotice = "Turned into action items.";
      }
      break;
    case "save":
      if (insight) {
        moments.add({ kind: "note", note: insight.text });
        await persistMoments(moments);
        if (sessionIsLive()) sessions.addEvent({ kind: "saved_moment", title: insight.title });
        state.lastNotice = "Saved to moments.";
      }
      break;
    case "diagnose":
      await runCopilotDiagnosis(resolution);
      break;
    case "summarize-blocker":
      void submitCommand("Summarize what's blocking me right now and the main friction.");
      break;
    case "create-fix-plan":
      void submitCommand("Create a step-by-step fix plan for what I'm stuck on.");
      break;
    case "save-issue": {
      const note = resolution.intervention?.body ?? insight?.text ?? "Diagnostic issue saved.";
      moments.add({ kind: "note", note: `Issue: ${note}` });
      await persistMoments(moments);
      if (sessionIsLive()) {
        sessions.addEvent({ kind: "saved_moment", title: "Saved issue", text: note });
      }
      state.lastNotice = "Saved issue to moments.";
      break;
    }
    case "show-summary":
      await generateCopilotDebrief();
      break;
    case "later":
    case "dismiss":
    case "none":
    default:
      break;
  }
}

async function handleSessionCommand(command: GlassCommand): Promise<void> {
  state.lastNotice = undefined;
  switch (command.type) {
    case "session-start":
      sessions.startSession(command.title);
      bindCopilotToSession();
      startCopilotLoop();
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
      stopCopilotLoop();
      await maybeAutoDebriefOnEnd();
      break;
    case "session-clear": {
      const session = sessions.current();
      if (session) await clearSessionScreenshotFolder(session.id);
      sessions.clearSession();
      copilot.bindSession(session?.id ?? null);
      copilotBoundSessionId = session?.id ?? null;
      state.latestScreenshot = null;
      state.pendingCaptureDataUrl = undefined;
      clearEphemeralVisualCapture();
      state.visualAskRetention = null;
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
          state.pendingCaptureDataUrl = result.imageDataUrl;
          await registerLatestGlassCapture({
            imageDataUrl: result.imageDataUrl,
            displayLabel: result.displayLabel,
            displayId: result.displayId,
            sourceTitle: ctxFields.sourceTitle ?? result.sourceName,
            sessionId: session.id,
            eventId: event.id,
            screenshotPath: event.screenshotPath,
            thumbnailPath: event.thumbnailPath,
            mimeType: event.screenshotMimeType,
          });
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
  syncCopilotToSession();
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

  ipcMain.on(IPC.command, (event, command: GlassCommand) => {
    void handleCommand(command, event.sender).catch((err) => {
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
      const vertical = glassUserSettings.dockOrientation === "vertical";
      resizeDockWindow(
        width,
        height,
        vertical ? { minWidth: DOCK_MIN_WIDTH_VERTICAL, vertical: true } : undefined,
      );
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
    ipcMain.handle(IPC.e2eSimulateCaptureFail, () => {
      process.env.IIVO_GLASS_E2E_CAPTURE_FAIL = "1";
      return { ok: true };
    });
    ipcMain.handle(IPC.e2eSimulateScreenEnumFail, () => {
      process.env.IIVO_GLASS_E2E_SCREEN_ENUM_FAIL = "1";
      return { ok: true };
    });
    ipcMain.handle(IPC.e2eSimulateSystemAudioEnumFail, () => {
      process.env.IIVO_GLASS_E2E_SYSTEM_AUDIO_ENUM_FAIL = "1";
      return { ok: true };
    });
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
  if (process.env.IIVO_GLASS_DIAGNOSE === "1") {
    glassUserSettings = await loadGlassUserSettings();
    refreshAppIdentityState();
    const report = await runCaptureDiagnosticsReport({
      displayTarget: glassUserSettings.displayTarget,
    });
    console.log(JSON.stringify(report, null, 2));
    app.quit();
    return;
  }

  refreshAppIdentityState();

  const showSplash =
    process.env.IIVO_GLASS_E2E !== "1" && isBootSplashBundlePresent(__dirname);
  if (showSplash) {
    beginGlassBootSequence();
    createSplashWindow();
  }
  const splashMinDisplay = showSplash
    ? new Promise<void>((resolve) => setTimeout(resolve, GLASS_BOOT_DURATION_MS))
    : Promise.resolve();

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
  state.selectedVirtualAudioDeviceId = glassUserSettings.selectedVirtualAudioDeviceId;
  copilot.setConfig(glassUserSettings.copilot);
  bindCopilotToSession();
  // Copilot never auto-starts listening; only resume its loop if a session is
  // already live (restored) and the user previously enabled an active mode.
  if (sessionIsLive() && copilotModeIsActive(copilot.getConfig().mode)) {
    startCopilotLoop();
  }
  state.windowContext = await getCurrentWindowContext();
  setChromeLayoutPersistHandler((partial) => {
    glassUserSettings = { ...glassUserSettings, ...partial };
    state.glassSettings = glassUserSettings;
    void persistGlassUserSettings(glassUserSettings);
  });
  registerIpc();
  createWindows(config, glassUserSettings.displayTarget);
  applyGlassUserSettings(glassUserSettings);
  registerGlobalHotkeys();
  push();

  if (showSplash) {
    const readyWindows = getWindows();
    const windowsReady = readyWindows ? whenGlassWindowsReady(readyWindows) : Promise.resolve();
    void Promise.all([windowsReady, splashMinDisplay]).then(() => finishSplash());
  }

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
