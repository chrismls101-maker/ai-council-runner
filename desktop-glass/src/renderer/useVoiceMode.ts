import { useCallback, useEffect, useReducer, useRef } from "react";
import { send, useGlassState } from "./useGlassState.ts";
import { useTranscriptionContext } from "./TranscriptionProvider.tsx";
import {
  initialVoiceModeState,
  voiceModeReducer,
  type VoiceModeState,
} from "../shared/voiceModeState.ts";
import {
  cancelAskCommand,
  stopEverythingCommand,
  voiceModeStatusLabel,
  voiceSubmitPlan,
} from "../shared/voiceModeActions.ts";
import {
  clearVoiceModeAutoSubmit,
  setVoiceModeAutoSubmit,
} from "../shared/voiceModeBridge.ts";

export interface VoiceModeController {
  state: VoiceModeState;
  statusLabel: string;
  liveTranscript: string;
  start: () => void;
  stop: () => void;
  cancel: () => void;
}

/**
 * Drives the explicit Voice Mode loop using {@link voiceModeReducer} as the
 * source of truth. Mic starts only on {@link start}. Finalized transcripts are
 * routed (direct / visual / debrief) via the shared action mapping, and Stop
 * Everything tears the whole thing down.
 */
export function useVoiceMode(): VoiceModeController {
  const glass = useGlassState();
  const tx = useTranscriptionContext();
  const [state, dispatch] = useReducer(voiceModeReducer, initialVoiceModeState);

  const stateRef = useRef(state);
  stateRef.current = state;
  const prevAskStatusRef = useRef(glass.askStatus);

  const restartListening = useCallback(() => {
    if (!stateRef.current.active) return;
    void tx.startMicrophoneListening("");
  }, [tx]);

  const start = useCallback(() => {
    dispatch({ type: "START" });
    setVoiceModeAutoSubmit((draft) => {
      const plan = voiceSubmitPlan(draft);
      dispatch({ type: "SUBMIT", text: draft });
      for (const command of plan.commands) send(command);
      // The debrief route has no ask-pending lifecycle to observe; cycle back
      // to listening so the loop continues.
      if (plan.route === "debrief") {
        dispatch({ type: "ANSWER_DONE" });
        setTimeout(restartListening, 0);
      }
      return true;
    });
    void tx.startMicrophoneListening("");
  }, [tx, restartListening]);

  const stop = useCallback(() => {
    dispatch({ type: "STOP_EVERYTHING" });
    clearVoiceModeAutoSubmit();
    send(stopEverythingCommand());
    tx.stopListeningLocal();
  }, [tx]);

  const cancel = useCallback(() => {
    dispatch({ type: "CANCEL" });
    send(cancelAskCommand());
    setTimeout(restartListening, 0);
  }, [restartListening]);

  // Mirror mic permission failures into the machine.
  useEffect(() => {
    if (!state.active) return;
    const denied =
      glass.micPermission === "denied" ||
      !!tx.lastError?.toLowerCase().includes("permission denied");
    if (denied && state.status !== "error") {
      dispatch({ type: "MIC_DENIED", message: tx.lastError ?? "Microphone permission denied." });
    }
  }, [glass.micPermission, tx.lastError, state.active, state.status]);

  // Mirror transcribing + capture (looking) phases for status display.
  useEffect(() => {
    if (!state.active) return;
    if (tx.transcribing && state.status === "listening") {
      dispatch({ type: "TRANSCRIBING" });
    }
  }, [tx.transcribing, state.active, state.status]);

  useEffect(() => {
    if (!state.active) return;
    if (glass.screenContextStatus?.kind === "looking") {
      dispatch({ type: "LOOKING" });
    }
  }, [glass.screenContextStatus?.kind, state.active]);

  // Drive thinking → done off the ask lifecycle (direct / visual routes).
  useEffect(() => {
    const now = glass.askStatus;
    const wasPending = prevAskStatusRef.current === "pending";
    prevAskStatusRef.current = now;
    if (!state.active) return;
    if (now === "pending") {
      dispatch({ type: "THINKING" });
    } else if (wasPending) {
      if (now === "error") {
        dispatch({ type: "ERROR", message: glass.lastError ?? "Something went wrong." });
      } else {
        dispatch({ type: "ANSWER_DONE" });
        setTimeout(restartListening, 0);
      }
    }
  }, [glass.askStatus, glass.lastError, state.active, restartListening]);

  // Cross-window start: the panel's Voice button bumps voiceModeStartNonce.
  // Start only on an actual increment (never on initial mount / launch).
  const prevNonceRef = useRef<number | undefined>(glass.voiceModeStartNonce);
  useEffect(() => {
    const nonce = glass.voiceModeStartNonce;
    const prev = prevNonceRef.current;
    prevNonceRef.current = nonce;
    if (nonce == null || prev == null) return;
    if (nonce > prev && !stateRef.current.active) {
      start();
    }
  }, [glass.voiceModeStartNonce, start]);

  // Always release the bridge handler on unmount.
  useEffect(() => () => clearVoiceModeAutoSubmit(), []);

  const liveTranscript =
    tx.commandBarListenText?.trim() || state.interim || state.transcript || "";

  return {
    state,
    statusLabel: voiceModeStatusLabel(state.status),
    liveTranscript,
    start,
    stop,
    cancel,
  };
}
