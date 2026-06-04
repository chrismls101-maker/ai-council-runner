import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { send, useGlassState } from "./useGlassState.ts";
import {
  TRANSCRIPTION_MODE_LABELS,
  type TranscriptionMode,
  type SystemAudioStatus,
} from "../shared/audioCaptureTypes.ts";
import {
  buildProviderSnapshot,
  canStartListening,
  modeStatusMessage,
  resolveMicrophoneMode,
} from "../shared/transcriptionProviders.ts";
import {
  mapSystemAudioCaptureError,
  mapSystemAudioStreamResult,
  stopMediaStreamState,
} from "../shared/systemAudioCapture.ts";
import {
  initialTranscriptionState,
  transcriptionReducer,
} from "../shared/transcriptionTypes.ts";
import type { GlassSpeechRecognition } from "./speech.d.ts";

type SpeechRecognitionCtor = new () => GlassSpeechRecognition;

const MODE_OPTIONS: TranscriptionMode[] = [
  "manual",
  "microphone_web_speech",
  "system_audio",
];

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function syncSystemAudioStatus(status: SystemAudioStatus, detail?: string): void {
  send({ type: "system-audio-set-status", status, detail });
}

export function useTranscription(): {
  selectedMode: TranscriptionMode;
  effectiveMode: TranscriptionMode;
  status: "idle" | "listening" | "paused";
  interimText?: string;
  statusMessage: string;
  systemAudioStatus: SystemAudioStatus;
  modeLabels: Record<TranscriptionMode, string>;
  modeOptions: TranscriptionMode[];
  canListen: boolean;
  setMode: (mode: TranscriptionMode) => void;
  startListening: () => void;
  stopListening: () => void;
  addChunkToSession: () => void;
} {
  const glassState = useGlassState();
  const [state, dispatch] = useReducer(transcriptionReducer, initialTranscriptionState);
  const [selectedMode, setSelectedMode] = useState<TranscriptionMode>("manual");
  const [systemAudioStatus, setSystemAudioStatus] = useState<SystemAudioStatus>(
    glassState.systemAudioStatus,
  );
  const [systemAudioDetail, setSystemAudioDetail] = useState<string | undefined>(
    glassState.systemAudioDetail,
  );
  const recognitionRef = useRef<GlassSpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setSystemAudioStatus(glassState.systemAudioStatus);
    setSystemAudioDetail(glassState.systemAudioDetail);
  }, [glassState.systemAudioStatus, glassState.systemAudioDetail]);

  const snapshot = useMemo(
    () =>
      buildProviderSnapshot(selectedMode, window, {
        systemAudioStatus,
        systemAudioDetail,
        systemAudioListening:
          selectedMode === "system_audio" && state.status === "listening",
      }),
    [selectedMode, systemAudioStatus, systemAudioDetail, state.status],
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

  const stopAllStreams = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      stopMediaStreamState(mediaStreamRef.current.getTracks());
      mediaStreamRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    stopAllStreams();
    dispatch({ type: "STOP_LISTENING" });
    send({ type: "pause" });
  }, [stopAllStreams]);

  const startWebSpeech = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      dispatch({
        type: "SET_ERROR",
        message: modeStatusMessage("microphone_web_speech", snapshot),
      });
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
      recorder.onstop = () => {
        mediaRecorderRef.current = null;
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      dispatch({ type: "START_LISTENING" });
      send({ type: "start-listening" });
    } catch {
      dispatch({
        type: "SET_ERROR",
        message: modeStatusMessage("microphone_media_recorder", snapshot),
      });
    }
  }, [snapshot]);

  const startSystemAudio = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      const status: SystemAudioStatus = "unsupported";
      setSystemAudioStatus(status);
      syncSystemAudioStatus(status);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      for (const track of stream.getVideoTracks()) {
        track.stop();
        stream.removeTrack(track);
      }
      const audioTracks = stream.getAudioTracks();
      const nextStatus = mapSystemAudioStreamResult(audioTracks.length);
      if (audioTracks.length === 0) {
        stopMediaStreamState(stream.getTracks());
        setSystemAudioStatus(nextStatus);
        syncSystemAudioStatus(nextStatus);
        dispatch({
          type: "SET_ERROR",
          message: modeStatusMessage("system_audio", {
            ...snapshot,
            systemAudioStatus: nextStatus,
          }),
        });
        return;
      }
      mediaStreamRef.current = stream;
      setSystemAudioStatus("available");
      setSystemAudioDetail(undefined);
      syncSystemAudioStatus("available");
      dispatch({ type: "START_LISTENING" });
      send({ type: "start-listening" });
    } catch (err) {
      const mapped = mapSystemAudioCaptureError(err);
      setSystemAudioStatus(mapped.status);
      setSystemAudioDetail(mapped.detail);
      syncSystemAudioStatus(mapped.status, mapped.detail);
      dispatch({
        type: "SET_ERROR",
        message: modeStatusMessage("system_audio", {
          ...snapshot,
          systemAudioStatus: mapped.status,
          systemAudioDetail: mapped.detail,
        }),
      });
    }
  }, [snapshot]);

  const startListening = useCallback(() => {
    if (selectedMode === "manual") return;
    if (!canStartListening(effectiveMode, snapshot)) return;
    if (effectiveMode === "microphone_web_speech") {
      startWebSpeech();
      return;
    }
    if (effectiveMode === "microphone_media_recorder") {
      void startMediaRecorder();
      return;
    }
    if (effectiveMode === "system_audio") {
      void startSystemAudio();
    }
  }, [
    selectedMode,
    effectiveMode,
    snapshot,
    startWebSpeech,
    startMediaRecorder,
    startSystemAudio,
  ]);

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
    const tags = selectedMode === "system_audio" ? ["system_audio"] : undefined;
    send({ type: "add-transcript-chunk", text: chunk, tags });
    dispatch({ type: "CLEAR_INTERIM" });
  }, [state.interimText, selectedMode]);

  return {
    selectedMode,
    effectiveMode,
    status: state.status,
    interimText: state.interimText,
    statusMessage: modeStatusMessage(selectedMode, snapshot),
    systemAudioStatus,
    modeLabels: TRANSCRIPTION_MODE_LABELS,
    modeOptions: MODE_OPTIONS,
    canListen: canStartListening(effectiveMode, snapshot),
    setMode,
    startListening,
    stopListening,
    addChunkToSession,
  };
}
