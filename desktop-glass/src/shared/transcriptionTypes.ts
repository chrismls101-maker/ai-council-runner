/**
 * Transcription modes and state for IIVO Glass v1.1.
 *
 * Mic transcription uses Web Speech API in the renderer when available.
 * Manual paste mode always works. Nothing records on launch.
 */

export type TranscriptionMode = "manual" | "mic_web_speech" | "unavailable";

export type TranscriptionStatus = "idle" | "listening" | "paused";

export interface TranscriptionState {
  mode: TranscriptionMode;
  status: TranscriptionStatus;
  /** Latest interim text from mic (not yet committed). */
  interimText?: string;
  lastError?: string;
}

export type TranscriptionAction =
  | { type: "SET_MODE"; mode: TranscriptionMode }
  | { type: "START_LISTENING" }
  | { type: "STOP_LISTENING" }
  | { type: "SET_INTERIM"; text: string }
  | { type: "CLEAR_INTERIM" }
  | { type: "SET_ERROR"; message?: string };

export const initialTranscriptionState: TranscriptionState = {
  mode: "manual",
  status: "idle",
};

export function transcriptionReducer(
  state: TranscriptionState,
  action: TranscriptionAction,
): TranscriptionState {
  switch (action.type) {
    case "SET_MODE":
      return {
        ...state,
        mode: action.mode,
        status: action.mode === "unavailable" ? "idle" : state.status,
        lastError: undefined,
      };
    case "START_LISTENING":
      if (state.mode === "unavailable") return state;
      return { ...state, status: "listening", lastError: undefined };
    case "STOP_LISTENING":
      return { ...state, status: "idle", interimText: undefined };
    case "SET_INTERIM":
      return { ...state, interimText: action.text };
    case "CLEAR_INTERIM":
      return { ...state, interimText: undefined };
    case "SET_ERROR":
      return { ...state, status: "idle", lastError: action.message };
    default:
      return state;
  }
}

/** Detect whether Web Speech API is likely available (renderer-only check). */
export function detectWebSpeechAvailable(win?: Window): boolean {
  if (!win) return false;
  return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
}

export function resolveTranscriptionMode(
  webSpeechAvailable: boolean,
): TranscriptionMode {
  if (webSpeechAvailable) return "mic_web_speech";
  return "unavailable";
}

export const TRANSCRIPTION_UNAVAILABLE_MESSAGE =
  "Microphone transcription is not available in this build. Paste transcript manually.";
