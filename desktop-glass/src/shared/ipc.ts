/**
 * IPC contract shared between the Electron main process, the preload bridge,
 * and the React renderers (dock + panel).
 */

import type { GlassConfig } from "./config.ts";
import type {
  ExtractedNotes,
  GlassMomentKind,
  PanelTab,
  SavedMoment,
} from "./types.ts";
import type { PrivacyState } from "./privacyState.ts";
import type { GlassSession } from "./sessionTypes.ts";
import type { TranscriptionMode, SystemAudioStatus } from "./audioCaptureTypes.ts";
import type { WindowContext } from "./windowContextTypes.ts";
import type { GlassSttState } from "./sttTypes.ts";
import type { GlassWindowState, OverlayMode } from "./glassWindowTypes.ts";
import type { GlassOperationDiagnostics } from "./glassOperations.ts";
import type { GlassCommandFeedItem } from "./commandFeed.ts";
import type { GlassAskStatus, GlassLastAskResponse } from "./glassAskTypes.ts";
import type { GlassLatestScreenshotState, GlassScreenContextStatus } from "./glassScreenContext.ts";
import type { GlassVisualAskRetention } from "./glassScreenshotRetention.ts";
import type { GlassUserSettings } from "./glassSettings.ts";
import type { ConnectedDisplaySnapshot } from "./displayInfo.ts";

export type { GlassSttState } from "./sttTypes.ts";

export type SessionActionStatus =
  | "idle"
  | "preparing"
  | "sending"
  | "opened"
  | "failed";

export type AnalysisStatus = "idle" | "running" | "done" | "failed";

export interface IivoAnalysisState {
  status: AnalysisStatus;
  text?: string;
  runId?: string;
  contextId?: string;
  error?: string;
  estimatedCredits?: number;
  updatedAt?: string;
}

export const IPC = {
  command: "glass:command",
  getState: "glass:get-state",
  state: "glass:state",
  setIgnoreMouse: "glass:set-ignore-mouse",
  resizeDock: "glass:resize-dock",
  windowContextGet: "glass:window-context-get-current",
  sttProcessChunk: "glass:stt-process-chunk",
  transcriptionControl: "glass:transcription-control",
  commandBarFocus: "glass:command-bar-focus",
  e2eGetExternalUrls: "glass:e2e-get-external-urls",
  e2eResetExternalUrls: "glass:e2e-reset-external-urls",
  e2eGetWindowMetadata: "glass:e2e-get-window-metadata",
  e2eGetCaptureTarget: "glass:e2e-get-capture-target",
  e2eSimulateCaptureFail: "glass:e2e-simulate-capture-fail",
  e2eSimulateScreenEnumFail: "glass:e2e-simulate-screen-enum-fail",
  e2eSimulateSystemAudioEnumFail: "glass:e2e-simulate-system-audio-enum-fail",
  e2eSetCaptureProbes: "glass:e2e-set-capture-probes",
} as const;

export type TranscriptionControlCommand =
  | { type: "start" }
  | { type: "stop" }
  | { type: "probe-microphone" }
  | { type: "probe-virtual-audio-devices" }
  | { type: "test-system-audio" }
  | { type: "test-blackhole" };

export type GlassCommand =
  | { type: "capture-screen" }
  | { type: "capture-screen-only" }
  | { type: "start-listening" }
  | { type: "pause" }
  | { type: "stop" }
  | { type: "stop-everything" }
  | { type: "request-start-listening" }
  | { type: "append-transcript"; text: string }
  | { type: "add-transcript-chunk"; text: string; tags?: string[] }
  | { type: "clear-transcript" }
  | { type: "transcription-set-mode"; mode: TranscriptionMode }
  | { type: "system-audio-set-status"; status: SystemAudioStatus; detail?: string }
  | { type: "report-virtual-audio-devices"; devices: { deviceId: string; label: string }[] }
  | { type: "set-selected-virtual-audio-device"; deviceId: string }
  | { type: "stt-listening-timer"; elapsedMs: number }
  | { type: "stt-cost-warning" }
  | { type: "save-moment"; note?: string; kind?: GlassMomentKind }
  | { type: "delete-moment"; id: string }
  | { type: "clear-moments" }
  | { type: "send-screenshot"; imageDataUrl?: string }
  | { type: "send-transcript" }
  | { type: "send-moment"; id: string }
  | { type: "ask-iivo" }
  | { type: "submit-command"; text: string }
  | { type: "ask-iivo-direct"; text: string }
  | { type: "cancel-glass-ask" }
  | { type: "set-glass-hotkey"; preset: GlassUserSettings["hotkeyPreset"] }
  | { type: "set-glass-display"; target: GlassUserSettings["displayTarget"] }
  | { type: "refresh-glass-layout" }
  | { type: "set-chrome-layout-locked"; locked: boolean }
  | { type: "chrome-window-drag"; dx: number; dy: number }
  | { type: "set-dock-orientation"; orientation: GlassUserSettings["dockOrientation"] }
  | { type: "set-save-visual-asks-to-session"; enabled: boolean }
  | { type: "set-auto-upload-captures-to-context"; enabled: boolean }
  | { type: "set-mic-auto-send-after-silence"; enabled: boolean }
  | { type: "save-last-visual-capture" }
  | { type: "reset-chrome-layout" }
  | { type: "open-feed-in-iivo"; id: string }
  | { type: "save-feed-moment"; id: string }
  | { type: "command-bar-blur" }
  | { type: "toggle-command-bar" }
  | { type: "clear-command-feed" }
  | { type: "pin-command-feed-item"; id: string; pinned: boolean }
  | { type: "open-chat" }
  | { type: "set-tab"; tab: PanelTab }
  | { type: "toggle-panel" }
  | { type: "toggle-overlay" }
  | { type: "set-overlay-mode"; mode: OverlayMode }
  | { type: "window-context-refresh" }
  | { type: "run-setup-check" }
  | { type: "run-capture-diagnostics" }
  | { type: "report-mic-permission"; status: import("./glassCapabilities.ts").MicPermissionReport }
  | { type: "open-screen-recording-settings" }
  | { type: "open-microphone-settings" }
  | { type: "open-privacy-settings" }
  | { type: "open-audio-midi-setup" }
  | { type: "open-sound-settings" }
  | { type: "show-virtual-audio-help" }
  | { type: "show-blackhole-setup" }
  | { type: "detect-audio-devices" }
  | { type: "test-blackhole" }
  | { type: "retry-capture-permission" }
  | { type: "retry-capture" }
  | { type: "retry-system-audio" }
  | { type: "test-microphone" }
  | { type: "test-system-audio" }
  | {
      type: "e2e-set-server-health";
      health: import("./glassCapabilities.ts").GlassServerHealthForSetup | null;
    }
  | {
      type: "e2e-set-capture-probes";
      screenCaptureProbe?: import("./captureSourceEnumeration.ts").ScreenCaptureProbeStatus;
      screenCaptureDetail?: string;
      windowCaptureProbe?: import("./captureSourceEnumeration.ts").WindowCaptureProbeStatus;
      systemAudioStatus?: SystemAudioStatus;
      systemAudioDetail?: string;
    }
  | { type: "session-start"; title?: string }
  | { type: "session-pause" }
  | { type: "session-resume" }
  | { type: "session-end" }
  | { type: "session-clear" }
  | { type: "session-capture" }
  | { type: "session-add-note"; text: string; sourceTitle?: string }
  | { type: "session-extract-insights" }
  | { type: "session-accept-insight"; id: string }
  | { type: "session-dismiss-insight"; id: string }
  | { type: "session-delete-event"; id: string }
  | { type: "session-save-insight-moment"; id: string }
  | { type: "session-send" }
  | { type: "session-send-event"; id: string }
  | { type: "session-send-insight"; id: string }
  | { type: "session-send-summary" }
  | { type: "session-open-in-iivo" }
  | { type: "session-analyze-now" }
  /** @deprecated use session-open-in-iivo */
  | { type: "session-analyze-council" }
  // --- Session Copilot ---
  | { type: "copilot-set-mode"; mode: import("./copilotTypes.ts").GlassCopilotMode }
  | { type: "copilot-set-config"; patch: Partial<import("./copilotTypes.ts").GlassCopilotConfig> }
  | { type: "copilot-set-muted"; muted: boolean }
  | {
      type: "copilot-card-action";
      id: string;
      action: import("./copilotTypes.ts").GlassCopilotCardAction;
    }
  | { type: "copilot-accept-offer"; mode: import("./copilotTypes.ts").GlassCopilotMode }
  | { type: "copilot-dismiss-offer" }
  | { type: "copilot-generate-debrief" }
  | { type: "copilot-dismiss-debrief" }
  | { type: "copilot-open-debrief-in-iivo" }
  | { type: "copilot-dismiss-silence-warning" }
  | { type: "copilot-pause-system-audio" };

export interface GlassState {
  privacy: PrivacyState;
  transcript: string;
  notes: ExtractedNotes;
  moments: SavedMoment[];
  panelTab: PanelTab;
  config: GlassConfig;
  lastError?: string;
  lastNotice?: string;
  lastSentUrl?: string;
  session: GlassSession | null;
  sessionSummary: string;
  sessionActionStatus: SessionActionStatus;
  transcriptionMode: TranscriptionMode;
  systemAudioStatus: SystemAudioStatus;
  systemAudioDetail?: string;
  windowContext: WindowContext;
  iivoAnalysis: IivoAnalysisState;
  stt: GlassSttState;
  panelVisible: boolean;
  windows: GlassWindowState;
  operationDiagnostics: GlassOperationDiagnostics;
  commandFeed: GlassCommandFeedItem[];
  askStatus: GlassAskStatus;
  lastAskResponse?: GlassLastAskResponse;
  latestScreenshot?: GlassLatestScreenshotState | null;
  screenContextStatus?: GlassScreenContextStatus;
  visualAskRetention?: GlassVisualAskRetention | null;
  visualAskPayloadDiagnostics?: import("./glassScreenContext.ts").VisualAskPayloadDiagnostics | null;
  visualAskDiagnostics?: import("./visualAskDiagnostics.ts").VisualAskDiagnostics | null;
  glassSettings: GlassUserSettings;
  availableDisplayIds: number[];
  connectedDisplays: ConnectedDisplaySnapshot[];
  setupCapabilities: import("./glassCapabilities.ts").GlassCapabilityRow[];
  setupCheckSummary?: string;
  captureDiagnosticsReport?: import("./captureDiagnostics.ts").CaptureDiagnosticsReport;
  appIdentityReport?: import("./glassAppIdentityReport.ts").GlassAppIdentityReport;
  duplicateAppBundles?: import("./glassAppIdentityReport.ts").DuplicateGlassAppBundle[];
  duplicateAppWarning?: string;
  virtualAudioDevices?: import("./virtualAudioDevices.ts").VirtualAudioDeviceMatch[];
  selectedVirtualAudioDeviceId?: string;
  micPermission: import("./glassCapabilities.ts").MicPermissionReport;
  copilot: import("./copilotTypes.ts").GlassCopilotRuntimeState;
}

export interface SttProcessChunkRequest {
  buffer: ArrayBuffer;
  mimeType: string;
  source: "microphone" | "system_audio";
  sessionId?: string;
}

export interface SttProcessChunkResponse {
  ok: boolean;
  text?: string;
  error?: string;
  eventId?: string;
}
