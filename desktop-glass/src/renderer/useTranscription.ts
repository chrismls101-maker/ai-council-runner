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
  mapGetUserMediaErrorToMicPermission,
  type MicPermissionReport,
} from "../shared/glassCapabilities.ts";
import {
  buildAskTextFromMicDraft,
  composeCommandBarMicText,
  isMicrophoneCaptureMode,
  isSystemAudioCaptureMode,
  MIC_PERMISSION_DENIED_DETAIL,
  MIC_PERMISSION_DENIED_MESSAGE,
  shouldAutoSendMicAfterSilence,
} from "../shared/commandBarMic.ts";
import {
  mapSystemAudioCaptureError,
  mapSystemAudioStreamResultDetail,
  stopMediaStreamState,
} from "../shared/systemAudioCapture.ts";
import { reportVirtualAudioDevices } from "./panel/virtualAudioScan.ts";
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
import { listeningModeHint } from "../shared/glassOperations.ts";
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

export interface TranscriptionController {
  selectedMode: TranscriptionMode;
  effectiveMode: TranscriptionMode;
  status: "idle" | "listening" | "paused";
  interimText?: string;
  commandBarListenText: string;
  isMicrophoneCapture: boolean;
  isSystemAudioCapture: boolean;
  micPermissionDenied: boolean;
  statusMessage: string;
  listeningHint: string;
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
  startMicrophoneListening: (inputPrefix?: string) => Promise<void>;
  startSystemAudioListening: () => void;
  startListening: () => void;
  stopListening: () => void;
  stopListeningLocal: () => void;
  setMicInputOverride: (text: string) => void;
  transcribeLastChunk: () => void;
  addChunkToSession: () => void;
  probeMicrophone: () => Promise<void>;
}

export function useTranscription(): TranscriptionController {
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
  const isListeningRef = useRef(false);

  useEffect(() => {
    setSystemAudioStatus(glassState.systemAudioStatus);
    setSystemAudioDetail(glassState.systemAudioDetail);
  }, [glassState.systemAudioStatus, glassState.systemAudioDetail]);

  useEffect(() => {
    isListeningRef.current = state.status === "listening";
  }, [state.status]);

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
  const micDraftRef = useRef({ prefix: "", finalized: "", interim: "" });

  useEffect(() => {
    micDraftRef.current = {
      prefix: state.micDraftPrefix ?? "",
      finalized: state.micDraftText ?? "",
      interim: state.interimText ?? "",
    };
  }, [state.micDraftPrefix, state.micDraftText, state.interimText]);

  const appendMicDraft = useCallback((text: string) => {
    dispatch({ type: "APPEND_MIC_DRAFT", text });
  }, []);

  const maybeAutoSendMicDraft = useCallback(() => {
    const draft = buildAskTextFromMicDraft(
      micDraftRef.current.prefix,
      micDraftRef.current.finalized,
      micDraftRef.current.interim,
    );
    if (
      !shouldAutoSendMicAfterSilence(
        glassState.glassSettings.micAutoSendAfterSilence,
        draft,
      )
    ) {
      return false;
    }
    send({ type: "submit-command", text: draft });
    stopListeningRef.current?.();
    return true;
  }, [glassState.glassSettings.micAutoSendAfterSilence]);

  const requestMicrophoneAccess = useCallback(async (): Promise<MicPermissionReport> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      send({ type: "report-mic-permission", status: "error" });
      dispatch({
        type: "SET_ERROR",
        message: "Microphone API is not available in this build.",
      });
      return "error";
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stopMediaStreamState(stream.getTracks());
      send({ type: "report-mic-permission", status: "granted" });
      dispatch({ type: "SET_ERROR", message: undefined });
      return "granted";
    } catch (err) {
      const status = mapGetUserMediaErrorToMicPermission(err);
      send({ type: "report-mic-permission", status });
      dispatch({
        type: "SET_ERROR",
        message:
          status === "denied"
            ? `${MIC_PERMISSION_DENIED_MESSAGE}. ${MIC_PERMISSION_DENIED_DETAIL}`
            : "Could not access microphone.",
      });
      return status;
    }
  }, []);

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
        return;
      }
      if (source === "microphone" && result.text?.trim()) {
        appendMicDraft(result.text.trim());
        send({
          type: "add-transcript-chunk",
          text: result.text.trim(),
          tags: ["microphone"],
        });
      }
    },
    [
      glassState.session?.id,
      glassState.stt.enabled,
      glassState.stt.status,
      appendMicDraft,
    ],
  );

  const stopListeningLocal = useCallback(() => {
    stopAllStreams();
    stopTimer();
    dispatch({ type: "STOP_LISTENING" });
  }, [stopAllStreams, stopTimer]);

  const stopListening = useCallback(() => {
    stopListeningLocal();
    send({ type: "pause" });
  }, [stopListeningLocal]);

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
        appendMicDraft(finalChunk.trim());
        send({ type: "add-transcript-chunk", text: finalChunk.trim(), tags: ["microphone"] });
        dispatch({ type: "CLEAR_INTERIM" });
      }
    };
    recognition.onerror = (event) => {
      const code = (event as { error?: string }).error;
      if (code === "not-allowed" || code === "service-not-allowed") {
        send({ type: "report-mic-permission", status: "denied" });
        dispatch({
          type: "SET_ERROR",
          message: `${MIC_PERMISSION_DENIED_MESSAGE}. ${MIC_PERMISSION_DENIED_DETAIL}`,
        });
      } else {
        dispatch({ type: "SET_ERROR", message: "Microphone transcription error." });
      }
      stopListening();
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      if (maybeAutoSendMicDraft()) return;
      if (isListeningRef.current) {
        try {
          recognition.start();
        } catch {
          stopListening();
        }
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
    dispatch({ type: "START_LISTENING" });
    send({ type: "start-listening" });
    startTimer();
  }, [snapshot, stopListening, startTimer, appendMicDraft, maybeAutoSendMicDraft]);

  const startMediaRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      send({ type: "report-mic-permission", status: "granted" });
      mediaStreamRef.current = stream;
      startChunkRecorder(stream, "microphone");
    } catch (err) {
      const denied = mapGetUserMediaErrorToMicPermission(err);
      if (denied === "denied") {
        send({ type: "report-mic-permission", status: "denied" });
        dispatch({
          type: "SET_ERROR",
          message: `${MIC_PERMISSION_DENIED_MESSAGE}. ${MIC_PERMISSION_DENIED_DETAIL}`,
        });
        return;
      }
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
      const mapped = mapSystemAudioStreamResultDetail(audioTracks.length);
      if (audioTracks.length === 0) {
        stopMediaStreamState(stream.getTracks());
        setSystemAudioStatus(mapped.status);
        setSystemAudioDetail(mapped.detail);
        syncSystemAudioStatus(mapped.status, mapped.detail);
        void reportVirtualAudioDevices();
        dispatch({
          type: "SET_ERROR",
          message: modeStatusMessage("system_audio", {
            ...snapshot,
            systemAudioStatus: mapped.status,
            systemAudioDetail: mapped.detail,
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

  const startSystemAudioListening = useCallback(() => {
    if (state.status === "listening") return;
    setSelectedMode("system_audio");
    dispatch({ type: "SET_ERROR", message: undefined });
    void startSystemAudio();
  }, [state.status, startSystemAudio]);

  const startMicrophoneListening = useCallback(
    async (inputPrefix = "") => {
      if (state.status === "listening") return;
      setSelectedMode("microphone_web_speech");
      dispatch({ type: "SET_MIC_DRAFT_PREFIX", text: inputPrefix });
      dispatch({ type: "SET_ERROR", message: undefined });

      const permission = await requestMicrophoneAccess();
      if (permission !== "granted") return;

      const snap = buildProviderSnapshot("microphone_web_speech", window, {
        systemAudioStatus,
        systemAudioDetail,
        stt: glassState.stt,
      });
      const mode = resolveMicrophoneMode(snap);
      if (mode === "manual" || !canStartListening(mode, { ...snap, selectedMode: mode })) {
        dispatch({
          type: "SET_ERROR",
          message: modeStatusMessage("microphone_web_speech", snap),
        });
        return;
      }
      dispatch({ type: "SET_MODE", mode });
      if (mode === "microphone_web_speech") {
        startWebSpeech();
        return;
      }
      if (mode === "microphone_media_recorder") {
        await startMediaRecorder();
      }
    },
    [
      state.status,
      requestMicrophoneAccess,
      systemAudioStatus,
      systemAudioDetail,
      glassState.stt,
      startWebSpeech,
      startMediaRecorder,
    ],
  );

  const startListening = useCallback(() => {
    if (selectedMode === "manual") {
      dispatch({ type: "SET_ERROR", message: "Choose Microphone or System Audio before starting." });
      return;
    }
    if (
      selectedMode === "microphone_web_speech" ||
      selectedMode === "microphone_media_recorder"
    ) {
      void startMicrophoneListening();
      return;
    }
    if (!canStartListening(effectiveMode, snapshot)) {
      dispatch({
        type: "SET_ERROR",
        message:
          !glassState.stt.enabled && usesSttChunkCapture(effectiveMode)
            ? STT_MIC_NOT_CONFIGURED_MESSAGE
            : modeStatusMessage(effectiveMode, snapshot),
      });
      return;
    }
    dispatch({ type: "SET_ERROR", message: undefined });
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
    glassState.stt.enabled,
    startWebSpeech,
    startMediaRecorder,
    startSystemAudio,
    startMicrophoneListening,
  ]);

  const setMicInputOverride = useCallback((text: string) => {
    dispatch({ type: "SET_MIC_INPUT", text });
  }, []);

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

  const probeMicrophone = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      send({ type: "report-mic-permission", status: "error" });
      dispatch({ type: "SET_ERROR", message: "Microphone API is not available." });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stopMediaStreamState(stream.getTracks());
      send({ type: "report-mic-permission", status: "granted" });
      dispatch({ type: "SET_ERROR", message: undefined });
    } catch (err) {
      const status = mapGetUserMediaErrorToMicPermission(err);
      send({ type: "report-mic-permission", status });
      dispatch({
        type: "SET_ERROR",
        message:
          status === "denied"
            ? "Microphone permission denied."
            : "Could not access microphone.",
      });
    }
  }, []);

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

  useEffect(
    () => () => {
      stopListeningLocal();
    },
    [stopListeningLocal],
  );

  const isMicrophoneCapture = isMicrophoneCaptureMode(selectedMode, effectiveMode);
  const isSystemAudioCapture = isSystemAudioCaptureMode(selectedMode, effectiveMode);
  const commandBarListenText = composeCommandBarMicText(
    state.micDraftPrefix ?? "",
    state.micDraftText ?? "",
    state.interimText,
  );
  const micPermissionDenied =
    glassState.micPermission === "denied" ||
    !!state.lastError?.toLowerCase().includes("permission denied");

  const listeningHint =
    state.status === "listening"
      ? listeningModeHint(effectiveMode, true) ||
        (!glassState.stt.enabled && usesSttChunkCapture(effectiveMode)
          ? "No transcription provider configured."
          : "Listening…")
      : !glassState.stt.enabled && selectedMode !== "manual"
        ? "No transcription provider configured."
        : "";

  return {
    selectedMode,
    effectiveMode,
    status: state.status,
    interimText: state.interimText,
    commandBarListenText,
    isMicrophoneCapture,
    isSystemAudioCapture,
    micPermissionDenied,
    statusMessage:
      state.status === "listening"
        ? `Listening via ${TRANSCRIPTION_MODE_LABELS[selectedMode] ?? selectedMode}…`
        : modeStatusMessage(selectedMode, snapshot),
    listeningHint,
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
    startMicrophoneListening,
    startSystemAudioListening,
    startListening,
    stopListening,
    stopListeningLocal,
    setMicInputOverride,
    transcribeLastChunk,
    addChunkToSession,
    probeMicrophone,
  };
}
