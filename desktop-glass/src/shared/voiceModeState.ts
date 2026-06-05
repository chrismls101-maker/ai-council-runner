/**
 * IIVO Glass — Voice Mode state machine (pure, no Electron / DOM).
 *
 * Voice Mode is an explicit, user-started mode that drives a
 * speak → transcribe → route → ask loop inside IIVO Glass. It NEVER starts
 * listening on launch and never captures or uploads without an explicit user
 * action. Stop Everything fully tears it down.
 *
 * This module owns only the state transitions. Side effects (mic, STT, capture,
 * GPT call) are performed by the caller in response to the resolved status.
 */

import { shouldCaptureScreenForGlassAsk } from "./glassVisualIntent.ts";
import { detectDebriefTrigger } from "./copilotDebrief.ts";

export type VoiceModeStatus =
  | "idle"
  | "listening"
  | "transcribing"
  | "deciding"
  | "looking"
  | "thinking"
  | "answering"
  | "error"
  | "stopped";

/** Which ask path a finished transcript should take. */
export type VoiceRoute = "direct" | "visual" | "debrief";

export interface VoiceModeState {
  /** True only while the user has Voice Mode explicitly turned on. */
  active: boolean;
  status: VoiceModeStatus;
  /** True only while the mic stream is actually running. */
  micActive: boolean;
  /** Accumulated finalized transcript for the current utterance. */
  transcript: string;
  /** Live (non-final) speech text. */
  interim: string;
  /** Route chosen for the submitted transcript. */
  route?: VoiceRoute;
  /** Partial/preview answer text shown while the model is still responding. */
  answerPreview?: string;
  /** Source-specific error, when status === "error". */
  error?: string;
}

export type VoiceModeEvent =
  /** User explicitly turns Voice Mode on. Mic starts only here. */
  | { type: "START" }
  /** Mic permission denied / unavailable. */
  | { type: "MIC_DENIED"; message: string }
  /** Live interim speech text (not yet final). */
  | { type: "INTERIM"; text: string }
  /** A chunk is being transcribed by STT (chunk-mode capture). */
  | { type: "TRANSCRIBING" }
  /** A finalized transcript fragment was produced. */
  | { type: "TRANSCRIPT"; text: string }
  /** User finished speaking or silence threshold hit → submit current transcript. */
  | { type: "SUBMIT"; text?: string }
  /** Capture started for a visual ask. */
  | { type: "LOOKING" }
  /** Model call in flight. */
  | { type: "THINKING" }
  /** Streaming/preview answer text arriving. */
  | { type: "ANSWER_PARTIAL"; text: string }
  /** Answer complete → return to listening if still active. */
  | { type: "ANSWER_DONE" }
  /** User interrupts/cancels the in-flight utterance or ask. */
  | { type: "CANCEL" }
  /** A recoverable error (STT/capture/model). Stays in Voice Mode. */
  | { type: "ERROR"; message: string }
  /** Stop Everything — tear down mic, capture, pending ask, and Voice Mode. */
  | { type: "STOP_EVERYTHING" };

export const initialVoiceModeState: VoiceModeState = {
  active: false,
  status: "idle",
  micActive: false,
  transcript: "",
  interim: "",
};

/**
 * Decide which ask path a finished transcript should take.
 * Debrief phrases win over visual; explicit screen phrasing → visual; else direct.
 */
export function resolveVoiceRoute(transcript: string): VoiceRoute {
  const text = transcript.trim();
  if (!text) return "direct";
  if (detectDebriefTrigger(text)) return "debrief";
  if (shouldCaptureScreenForGlassAsk(text)) return "visual";
  return "direct";
}

const STOPPED_STATE: VoiceModeState = {
  active: false,
  status: "stopped",
  micActive: false,
  transcript: "",
  interim: "",
  route: undefined,
  answerPreview: undefined,
  error: undefined,
};

export function voiceModeReducer(
  state: VoiceModeState,
  event: VoiceModeEvent,
): VoiceModeState {
  switch (event.type) {
    case "START":
      // Mic only starts on this explicit user action.
      return {
        active: true,
        status: "listening",
        micActive: true,
        transcript: "",
        interim: "",
        route: undefined,
        answerPreview: undefined,
        error: undefined,
      };

    case "MIC_DENIED":
      return {
        ...state,
        status: "error",
        micActive: false,
        error: event.message,
      };

    case "INTERIM":
      if (!state.active) return state;
      return { ...state, status: "listening", interim: event.text };

    case "TRANSCRIBING":
      if (!state.active) return state;
      return { ...state, status: "transcribing" };

    case "TRANSCRIPT": {
      if (!state.active) return state;
      const merged = `${state.transcript} ${event.text}`.trim();
      return {
        ...state,
        status: "listening",
        transcript: merged,
        interim: "",
        error: undefined,
      };
    }

    case "SUBMIT": {
      if (!state.active) return state;
      const transcript = (event.text ?? state.transcript).trim();
      if (!transcript) return state;
      const route = resolveVoiceRoute(transcript);
      return {
        ...state,
        transcript,
        interim: "",
        route,
        // Visual asks go through a capture (looking) phase first.
        status: "deciding",
        answerPreview: undefined,
        error: undefined,
      };
    }

    case "LOOKING":
      if (!state.active) return state;
      return { ...state, status: "looking" };

    case "THINKING":
      if (!state.active) return state;
      return { ...state, status: "thinking" };

    case "ANSWER_PARTIAL":
      if (!state.active) return state;
      return { ...state, status: "answering", answerPreview: event.text };

    case "ANSWER_DONE":
      if (!state.active) return state;
      // Continuous loop: return to listening, clear the consumed utterance.
      return {
        ...state,
        status: "listening",
        transcript: "",
        interim: "",
        route: undefined,
        answerPreview: undefined,
        error: undefined,
      };

    case "CANCEL":
      if (!state.active) return state;
      // Interrupt: drop pending utterance/ask, keep listening.
      return {
        ...state,
        status: "listening",
        transcript: "",
        interim: "",
        route: undefined,
        answerPreview: undefined,
        error: undefined,
      };

    case "ERROR":
      return { ...state, status: "error", error: event.message };

    case "STOP_EVERYTHING":
      return { ...STOPPED_STATE };

    default: {
      const _exhaustive: never = event;
      return state;
    }
  }
}

/** True when the machine is mid-ask (route decided, answer not yet returned). */
export function voiceModeIsBusy(state: VoiceModeState): boolean {
  return (
    state.status === "deciding" ||
    state.status === "looking" ||
    state.status === "thinking" ||
    state.status === "answering"
  );
}

/** True when the mic should be actively capturing. */
export function voiceModeMicShouldRun(state: VoiceModeState): boolean {
  return state.active && state.micActive && state.status !== "error";
}
