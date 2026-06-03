/**
 * Privacy/capture state machine for IIVO Glass.
 *
 * Safety invariants enforced here:
 *  - Initial state never captures or listens (nothing on launch).
 *  - Capture/send are transient and always return to a safe resting status.
 *  - Listening only turns on via an explicit START_LISTENING action.
 */

import type { GlassStatus } from "./types.ts";

export interface PrivacyState {
  status: GlassStatus;
  listening: boolean;
  capturing: boolean;
  /** ISO timestamp of the last privacy-relevant action, for the UI indicator. */
  lastActionAt?: string;
}

export type PrivacyAction =
  | { type: "START_LISTENING"; at?: string }
  | { type: "PAUSE"; at?: string }
  | { type: "STOP"; at?: string }
  | { type: "CAPTURE_START"; at?: string }
  | { type: "CAPTURE_DONE"; at?: string }
  | { type: "SEND_START"; at?: string }
  | { type: "SEND_DONE"; at?: string }
  | { type: "RESET" };

export const initialPrivacyState: PrivacyState = {
  status: "idle",
  listening: false,
  capturing: false,
};

function restingStatus(listening: boolean): GlassStatus {
  return listening ? "listening" : "idle";
}

export function privacyReducer(state: PrivacyState, action: PrivacyAction): PrivacyState {
  switch (action.type) {
    case "START_LISTENING":
      return { ...state, listening: true, status: "listening", lastActionAt: action.at };
    case "PAUSE":
    case "STOP":
      return {
        ...state,
        listening: false,
        capturing: false,
        status: "idle",
        lastActionAt: action.at,
      };
    case "CAPTURE_START":
      return { ...state, capturing: true, status: "capturing", lastActionAt: action.at };
    case "CAPTURE_DONE":
      return {
        ...state,
        capturing: false,
        status: restingStatus(state.listening),
        lastActionAt: action.at,
      };
    case "SEND_START":
      return { ...state, status: "sending", lastActionAt: action.at };
    case "SEND_DONE":
      return { ...state, status: "sent", lastActionAt: action.at };
    case "RESET":
      return { ...initialPrivacyState };
    default:
      return state;
  }
}
