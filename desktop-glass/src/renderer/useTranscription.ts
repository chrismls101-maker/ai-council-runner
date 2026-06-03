import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { send } from "./useGlassState.ts";
import {
  TRANSCRIPTION_MODE_LABELS,
  type TranscriptionMode,
} from "../shared/audioCaptureTypes.ts";
import {
  buildProviderSnapshot,
  canStartListening,
  modeStatusMessage,
  resolveMicrophoneMode,
} from "../shared/transcriptionProviders.ts";
import {
  initialTranscriptionState,
  transcriptionReducer,
} from "../shared/transcriptionTypes.ts";
import type { GlassSpeechRecognition } from "./speech.d.ts";

type SpeechRecognitionCtor = new () => GlassSpeechRecognition;

const MODE_OPTIONS: TranscriptionMode[] = [
  "manual",
  "microphone_web_speech",
  "system_audio_unavailable",
];

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useTranscription(): {
  selectedMode: TranscriptionMode;
  effectiveMode: TranscriptionMode;
  status: "idle" | "listening" | "paused";
  interimText?: string;
  statusMessage: string;
  modeLabels: Record<TranscriptionMode, string>;
  modeOptions: TranscriptionMode[];
  canListen: boolean;
  setMode: (mode: TranscriptionMode) => void;
  startListening: () => void;
  stopListening: () => void;
  addChunkToSession: () => void;
} {
  const [state, dispatch] = useReducer(transcriptionReducer, initialTranscriptionState);
  const [selectedMode, setSelectedMode] = useState<TranscriptionMode>("manual");
  const recognitionRef = useRef<GlassSpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const snapshot = useMemo(
    () => buildProviderSnapshot(selectedMode, window),
    [selectedMode],
  );

  const effectiveMode = useMemo(() => {
    if (selectedMode === "microphone_web_speech") {
      return resolveMicrophoneMode(snapshot);
    }
    return selectedMode;
  }, [selectedMode, snapshot]);

  useEffect(() => {
    dispatch({ type: "SET_MODE", mode: effectiveMode });
    send({ type: "transcription-set-mode", mode: effectiveMode });
  }, [effectiveMode]);

  const stopMediaRecorder = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    stopMediaRecorder();
    dispatch({ type: "STOP_LISTENING" });
    send({ type: "pause" });
  }, [stopMediaRecorder]);

  const startWebSpeech = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      dispatch({ type: "SET_ERROR", message: modeStatusMessage("microphone_web_speech", snapshot) });
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
  }, [snapshot, stopListening]);

  const startMediaRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorder.onstop = () => stopMediaRecorder();
      mediaRecorderRef.current = recorder;
      recorder.start();
      dispatch({ type: "START_LISTENING" });
      send({ type: "start-listening" });
    } catch {
      dispatch({ type: "SET_ERROR", message: modeStatusMessage("microphone_media_recorder", snapshot) });
    }
  }, [snapshot, stopMediaRecorder]);

  const startListening = useCallback(() => {
    if (selectedMode === "system_audio_unavailable") return;
    if (!canStartListening(effectiveMode, snapshot)) return;
    if (effectiveMode === "microphone_web_speech") {
      startWebSpeech();
      return;
    }
    if (effectiveMode === "microphone_media_recorder") {
      void startMediaRecorder();
    }
  }, [selectedMode, effectiveMode, snapshot, startWebSpeech, startMediaRecorder]);

  const setMode = useCallback(
    (mode: TranscriptionMode) => {
      if (state.status === "listening") stopListening();
      setSelectedMode(mode);
    },
    [state.status, stopListening],
  );

  const addChunkToSession = useCallback(() => {
    const chunk = state.interimText?.trim();
    if (!chunk) return;
    send({ type: "add-transcript-chunk", text: chunk });
    dispatch({ type: "CLEAR_INTERIM" });
  }, [state.interimText]);

  return {
    selectedMode,
    effectiveMode,
    status: state.status,
    interimText: state.interimText,
    statusMessage: modeStatusMessage(selectedMode, snapshot),
    modeLabels: TRANSCRIPTION_MODE_LABELS,
    modeOptions: MODE_OPTIONS,
    canListen: canStartListening(effectiveMode, snapshot),
    setMode,
    startListening,
    stopListening,
    addChunkToSession,
  };
}
