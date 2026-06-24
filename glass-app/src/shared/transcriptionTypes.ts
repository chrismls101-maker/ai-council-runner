/**
 * Transcription state reducer for IIVO Glass (shared, testable).
 */

import type { TranscriptionMode, TranscriptionStatus } from "./audioCaptureTypes.ts";
import { MICROPHONE_UNAVAILABLE_MESSAGE } from "./audioCaptureTypes.ts";

export type { TranscriptionMode, TranscriptionStatus } from "./audioCaptureTypes.ts";

export interface TranscriptionState {
  mode: TranscriptionMode;
  status: TranscriptionStatus;
  interimText?: string;
  /** Text already in the command bar when mic listening started. */
  micDraftPrefix?: string;
  /** Finalized speech appended while listening (mic only). */
  micDraftText?: string;
  lastError?: string;
}

export type TranscriptionAction =
  | { type: "SET_MODE"; mode: TranscriptionMode }
  | { type: "START_LISTENING" }
  | { type: "STOP_LISTENING" }
  | { type: "SET_INTERIM"; text: string }
  | { type: "CLEAR_INTERIM" }
  | { type: "SET_MIC_DRAFT_PREFIX"; text: string }
  | { type: "APPEND_MIC_DRAFT"; text: string }
  | { type: "SET_MIC_INPUT"; text: string }
  | { type: "SET_ERROR"; message?: string };

export const initialTranscriptionState: TranscriptionState = {
  mode: "manual",
  status: "idle",
};

function isListeningCapableMode(mode: TranscriptionMode): boolean {
  return (
    mode === "microphone_web_speech" ||
    mode === "microphone_media_recorder" ||
    mode === "system_audio"
  );
}

export function transcriptionReducer(
  state: TranscriptionState,
  action: TranscriptionAction,
): TranscriptionState {
  switch (action.type) {
    case "SET_MODE":
      return {
        ...state,
        mode: action.mode,
        status: action.mode === "manual" ? "idle" : state.status,
        lastError: undefined,
      };
    case "START_LISTENING":
      if (state.mode === "manual") return state;
      if (!isListeningCapableMode(state.mode)) {
        return { ...state, lastError: MICROPHONE_UNAVAILABLE_MESSAGE };
      }
      return { ...state, status: "listening", lastError: undefined };
    case "STOP_LISTENING": {
      const merged = [state.micDraftPrefix, state.micDraftText, state.interimText]
        .map((s) => s?.trim())
        .filter(Boolean)
        .join(" ");
      return {
        ...state,
        status: "idle",
        interimText: undefined,
        micDraftPrefix: merged || undefined,
        micDraftText: undefined,
      };
    }
    case "SET_INTERIM":
      return { ...state, interimText: action.text };
    case "CLEAR_INTERIM":
      return { ...state, interimText: undefined };
    case "SET_MIC_DRAFT_PREFIX":
      return { ...state, micDraftPrefix: action.text, micDraftText: "" };
    case "APPEND_MIC_DRAFT": {
      const chunk = action.text.trim();
      if (!chunk) return state;
      const prev = state.micDraftText?.trim() ?? "";
      return {
        ...state,
        micDraftText: prev ? `${prev} ${chunk}` : chunk,
        interimText: undefined,
      };
    }
    case "SET_MIC_INPUT":
      return {
        ...state,
        micDraftPrefix: action.text,
        micDraftText: "",
        interimText: undefined,
      };
    case "SET_ERROR":
      return { ...state, status: "idle", lastError: action.message };
    default:
      return state;
  }
}
