/**
 * Operation diagnostics and user-facing capture/listening messages.
 */

import { privacyReducer, type PrivacyState } from "./privacyState.ts";
import type { GlassSttState } from "./sttTypes.ts";
import { sttStatusMessage } from "./sttTypes.ts";

export type OperationCommandStatus = "idle" | "pending" | "ok" | "error";

export interface GlassOperationDiagnostics {
  lastCommand?: string;
  lastCommandStatus: OperationCommandStatus;
  lastError?: string;
  listeningSource?: string;
  sttProviderStatus?: string;
  captureStatus?: string;
  serverSttStatus?: string;
  hotkeyStatus?: string;
  displayInfo?: string;
}

export const INITIAL_OPERATION_DIAGNOSTICS: GlassOperationDiagnostics = {
  lastCommandStatus: "idle",
};

export const CAPTURE_PERMISSION_MESSAGE =
  "Screen Recording permission required. Enable IIVO Glass in System Settings → Privacy & Security → Screen Recording, then restart Glass.";

export const CAPTURE_SUCCESS_MESSAGE = "Screen captured.";
export const CAPTURE_SESSION_SUCCESS_MESSAGE = "Screen captured and added to session timeline.";
export const CAPTURE_NO_SESSION_HINT =
  "Screen captured locally. Start a session to keep captures in the timeline, or use Send to IIVO.";

export const STOPPED_MESSAGE = "Stopped — listening and capture are off.";
export const LISTENING_STOPPED_MESSAGE = "Listening stopped.";

export function captureErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "Screen capture failed";
  if (/permission|empty image|screen recording/i.test(msg)) {
    return `${msg} ${CAPTURE_PERMISSION_MESSAGE}`;
  }
  return msg;
}

export function listeningModeHint(mode: string, listening: boolean): string {
  if (!listening) return "";
  switch (mode) {
    case "microphone_web_speech":
      return "Live transcript should appear as you speak.";
    case "microphone_media_recorder":
      return "Listening… transcript will appear after each ~20 second chunk is processed.";
    case "system_audio":
      return "System audio is being captured. Transcript appears after processing if STT is configured.";
    default:
      return "Listening… transcript will appear after a chunk is processed.";
  }
}

export function createInitialOperationDiagnostics(): GlassOperationDiagnostics {
  return { ...INITIAL_OPERATION_DIAGNOSTICS };
}

export function recordOperation(
  diagnostics: GlassOperationDiagnostics,
  command: string,
  status: OperationCommandStatus,
  error?: string,
): GlassOperationDiagnostics {
  return {
    ...diagnostics,
    lastCommand: command,
    lastCommandStatus: status,
    lastError: error,
  };
}

export function applyStopAllState(opts: {
  privacy: PrivacyState;
  stt: GlassSttState;
  diagnostics: GlassOperationDiagnostics;
}): {
  privacy: PrivacyState;
  stt: GlassSttState;
  diagnostics: GlassOperationDiagnostics;
  lastNotice: string;
  lastError?: string;
} {
  return {
    privacy: privacyReducer(opts.privacy, { type: "STOP", at: new Date().toISOString() }),
    stt: {
      ...opts.stt,
      listeningElapsedMs: 0,
      transcribing: false,
      lastError: undefined,
    },
    diagnostics: recordOperation(opts.diagnostics, "stop-everything", "ok"),
    lastNotice: STOPPED_MESSAGE,
    lastError: undefined,
  };
}

export function diagnosticsForListening(
  diagnostics: GlassOperationDiagnostics,
  transcriptionMode: string,
  stt: GlassSttState,
): GlassOperationDiagnostics {
  return {
    ...diagnostics,
    listeningSource: transcriptionMode,
    sttProviderStatus: sttStatusMessage(stt.status, stt.endpoint),
    serverSttStatus: stt.endpoint === "server" ? sttStatusMessage(stt.status, stt.endpoint) : undefined,
  };
}

export function diagnosticsForCapture(
  diagnostics: GlassOperationDiagnostics,
  ok: boolean,
  error?: string,
): GlassOperationDiagnostics {
  return recordOperation(
    {
      ...diagnostics,
      captureStatus: ok ? "ok" : "failed",
    },
    "capture-screen",
    ok ? "ok" : "error",
    error,
  );
}
