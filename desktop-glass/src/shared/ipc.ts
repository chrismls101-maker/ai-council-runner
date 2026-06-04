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
} as const;

export type GlassCommand =
  | { type: "capture-screen" }
  | { type: "start-listening" }
  | { type: "pause" }
  | { type: "stop" }
  | { type: "append-transcript"; text: string }
  | { type: "add-transcript-chunk"; text: string; tags?: string[] }
  | { type: "clear-transcript" }
  | { type: "transcription-set-mode"; mode: TranscriptionMode }
  | { type: "system-audio-set-status"; status: SystemAudioStatus; detail?: string }
  | { type: "stt-listening-timer"; elapsedMs: number }
  | { type: "stt-cost-warning" }
  | { type: "save-moment"; note?: string; kind?: GlassMomentKind }
  | { type: "delete-moment"; id: string }
  | { type: "clear-moments" }
  | { type: "send-screenshot"; imageDataUrl?: string }
  | { type: "send-transcript" }
  | { type: "send-moment"; id: string }
  | { type: "ask-iivo" }
  | { type: "open-chat" }
  | { type: "set-tab"; tab: PanelTab }
  | { type: "toggle-panel" }
  | { type: "toggle-overlay" }
  | { type: "set-overlay-mode"; mode: OverlayMode }
  | { type: "window-context-refresh" }
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
  | { type: "session-analyze-council" };

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
