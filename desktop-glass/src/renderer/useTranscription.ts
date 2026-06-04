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
  usesSttChunkCapture,
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
import {
  STT_MIC_NOT_CONFIGURED_MESSAGE,
  sttProviderLabel,
  sttStatusMessage,
  resolveMicPathLabel,
} from "../shared/sttTypes.ts";
import {
  systemAudioFixHint,
  sttFixHint,
} from "../shared/systemAudioFixHints.ts";
import {
  DEFAULT_CHUNK_MS,
  formatListeningDuration,
  shouldAutoStopListening,
  shouldWarnListeningCost,
} from "../shared/audioChunks.ts";
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

function pickRecorderMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
}

export function useTranscription(): {
  selectedMode: TranscriptionMode;
  effectiveMode: TranscriptionMode;
  status: "idle" | "listening" | "paused";
  interimText?: string;
  statusMessage: string;
  systemAudioStatus: SystemAudioStatus;
  sttProviderLabel: string;
  sttStatusMessage: string;
  sttFixHint: string;
  systemAudioHint: string;
  micPathLabel?: string;
  listeningDuration: string;
  transcribing: boolean;
  lastTranscript?: string;
  lastError?: string;
  modeLabels: Record<TranscriptionMode, string>;
  modeOptions: TranscriptionMode[];
  canListen: boolean;
  canTranscribeLastChunk: boolean;
  setMode: (mode: TranscriptionMode) => void;
  startListening: () => void;
  stopListening: () => void;
  transcribeLastChunk: () => void;
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
  const [elapsedMs, setElapsedMs] = useState(0);
  const [hasLastChunk, setHasLastChunk] = useState(false);
  const costWarnedRef = useRef(false);
  const recognitionRef = useRef<GlassSpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const lastBlobRef = useRef<Blob | null>(null);
  const lastMimeRef = useRef<string>("audio/webm");
  const timerRef = useRef<number | null>(null);
  const chunkSourceRef = useRef<"microphone" | "system_audio">("microphone");

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
        stt: glassState.stt,
      }),
    [selectedMode, systemAudioStatus, systemAudioDetail, state.status, glassState.stt],
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

  const stopTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setElapsedMs(0);
    costWarnedRef.current = false;
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    const started = Date.now();
    timerRef.current = window.setInterval(() => {
      const next = Date.now() - started;
      setElapsedMs(next);
      send({ type: "stt-listening-timer", elapsedMs: next });
      if (shouldWarnListeningCost(next, costWarnedRef.current)) {
        costWarnedRef.current = true;
        send({ type: "stt-cost-warning" });
      }
      if (
        shouldAutoStopListening(
          next,
          glassState.stt.autoStopEnabled,
          glassState.stt.autoStopMs,
        )
      ) {
        stopListeningRef.current?.();
      }
    }, 1000);
  }, [glassState.stt.autoStopEnabled, glassState.stt.autoStopMs, stopTimer]);

  const stopAllStreams = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      stopMediaStreamState(mediaStreamRef.current.getTracks());
      mediaStreamRef.current = null;
    }
  }, []);

  const stopListeningRef = useRef<(() => void) | null>(null);

  const processBlob = useCallback(
    async (blob: Blob, mimeType: string, source: "microphone" | "system_audio") => {
      lastBlobRef.current = blob;
      lastMimeRef.current = mimeType;
      setHasLastChunk(true);
      if (!glassState.stt.enabled) {
        dispatch({
          type: "SET_ERROR",
          message:
            source === "microphone"
              ? STT_MIC_NOT_CONFIGURED_MESSAGE
              : sttStatusMessage(glassState.stt.status),
        });
        return;
      }
      const buffer = await blob.arrayBuffer();
      const result = await window.glass.processSttChunk({
        buffer,
        mimeType,
        source,
        sessionId: glassState.session?.id,
      });
      if (!result.ok) {
        dispatch({ type: "SET_ERROR", message: result.error ?? "Transcription failed." });
      }
    },
    [glassState.session?.id, glassState.stt.enabled, glassState.stt.status],
  );

  const stopListening = useCallback(() => {
    stopAllStreams();
    stopTimer();
    dispatch({ type: "STOP_LISTENING" });
    send({ type: "pause" });
  }, [stopAllStreams, stopTimer]);

  stopListeningRef.current = stopListening;

  const startChunkRecorder = useCallback(
    (stream: MediaStream, source: "microphone" | "system_audio") => {
      chunkSourceRef.current = source;
      const mimeType = pickRecorderMime();
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size < 512) return;
        void processBlob(event.data, mimeType, source);
      };
      recorder.onstop = () => {
        mediaRecorderRef.current = null;
      };
      mediaRecorderRef.current = recorder;
      recorder.start(DEFAULT_CHUNK_MS);
      dispatch({ type: "START_LISTENING" });
      send({ type: "start-listening" });
      startTimer();
    },
    [processBlob, startTimer],
  );

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
        send({ type: "add-transcript-chunk", text: finalChunk.trim(), tags: ["microphone"] });
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
    startTimer();
  }, [snapshot, stopListening, startTimer]);

  const startMediaRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      startChunkRecorder(stream, "microphone");
    } catch {
      dispatch({
        type: "SET_ERROR",
        message: modeStatusMessage("microphone_media_recorder", snapshot),
      });
    }
  }, [snapshot, startChunkRecorder]);

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
      startChunkRecorder(stream, "system_audio");
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
  }, [snapshot, startChunkRecorder]);

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

  const transcribeLastChunk = useCallback(() => {
    const blob = lastBlobRef.current;
    if (!blob) return;
    void processBlob(blob, lastMimeRef.current, chunkSourceRef.current);
  }, [processBlob]);

  const addChunkToSession = useCallback(() => {
    const chunk = state.interimText?.trim();
    if (!chunk) return;
    const tags =
      selectedMode === "system_audio"
        ? ["system_audio"]
        : selectedMode === "manual"
          ? undefined
          : ["microphone"];
    send({ type: "add-transcript-chunk", text: chunk, tags });
    dispatch({ type: "CLEAR_INTERIM" });
  }, [state.interimText, selectedMode]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  return {
    selectedMode,
    effectiveMode,
    status: state.status,
    interimText: state.interimText,
    statusMessage: modeStatusMessage(selectedMode, snapshot),
    systemAudioStatus,
    sttProviderLabel: sttProviderLabel(
      glassState.stt.provider,
      glassState.stt.status,
      glassState.stt.endpoint,
    ),
    sttStatusMessage: sttStatusMessage(glassState.stt.status, glassState.stt.endpoint),
    sttFixHint: sttFixHint(glassState.stt.status),
    systemAudioHint:
      selectedMode === "system_audio"
        ? systemAudioFixHint(systemAudioStatus)
        : "",
    micPathLabel: resolveMicPathLabel(effectiveMode),
    listeningDuration: formatListeningDuration(elapsedMs),
    transcribing: !!glassState.stt.transcribing,
    lastTranscript: glassState.stt.lastTranscript,
    lastError: state.lastError ?? glassState.stt.lastError,
    modeLabels: TRANSCRIPTION_MODE_LABELS,
    modeOptions: MODE_OPTIONS,
    canListen: canStartListening(effectiveMode, snapshot),
    canTranscribeLastChunk: hasLastChunk && usesSttChunkCapture(effectiveMode),
    setMode,
    startListening,
    stopListening,
    transcribeLastChunk,
    addChunkToSession,
  };
}
