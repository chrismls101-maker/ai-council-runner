import { useCallback, useEffect, useReducer, useRef } from "react";
import { send } from "./useGlassState.ts";
import {
  detectWebSpeechAvailable,
  initialTranscriptionState,
  resolveTranscriptionMode,
  transcriptionReducer,
  TRANSCRIPTION_UNAVAILABLE_MESSAGE,
  type TranscriptionMode,
} from "../shared/transcriptionTypes.ts";

import type { GlassSpeechRecognition } from "./speech.d.ts";

type SpeechRecognitionCtor = new () => GlassSpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useTranscription(): {
  mode: TranscriptionMode;
  status: "idle" | "listening" | "paused";
  interimText?: string;
  unavailableMessage: string;
  startListening: () => void;
  stopListening: () => void;
  addChunkToSession: () => void;
} {
  const [state, dispatch] = useReducer(transcriptionReducer, initialTranscriptionState);
  const recognitionRef = useRef<GlassSpeechRecognition | null>(null);

  useEffect(() => {
    const available = detectWebSpeechAvailable(window);
    const mode = resolveTranscriptionMode(available);
    dispatch({ type: "SET_MODE", mode });
    send({ type: "transcription-set-mode", mode });
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    dispatch({ type: "STOP_LISTENING" });
    send({ type: "pause" });
  }, []);

  const startListening = useCallback(() => {
    if (state.mode === "unavailable") return;
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      dispatch({ type: "SET_ERROR", message: TRANSCRIPTION_UNAVAILABLE_MESSAGE });
      return;
    }
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let interim = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const part = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) finalChunk += part;
        else interim += part;
      }
      if (interim) dispatch({ type: "SET_INTERIM", text: interim });
      if (finalChunk.trim()) {
        send({ type: "add-transcript-chunk", text: finalChunk.trim() });
        dispatch({ type: "CLEAR_INTERIM" });
      }
    };
    recognition.onerror = () => {
      dispatch({ type: "SET_ERROR", message: "Microphone transcription error." });
      stopListening();
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) stopListening();
    };
    recognitionRef.current = recognition;
    recognition.start();
    dispatch({ type: "START_LISTENING" });
    send({ type: "start-listening" });
  }, [state.mode, stopListening]);

  const addChunkToSession = useCallback(() => {
    const chunk = state.interimText?.trim();
    if (!chunk) return;
    send({ type: "add-transcript-chunk", text: chunk });
    dispatch({ type: "CLEAR_INTERIM" });
  }, [state.interimText]);

  return {
    mode: state.mode,
    status: state.status,
    interimText: state.interimText,
    unavailableMessage: TRANSCRIPTION_UNAVAILABLE_MESSAGE,
    startListening,
    stopListening,
    addChunkToSession,
  };
}
