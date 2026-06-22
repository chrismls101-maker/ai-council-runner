/**
 * Transcription provider detection and mode resolution for IIVO Glass.
 */

import type { TranscriptionMode, SystemAudioStatus } from "./audioCaptureTypes.ts";
import type { VirtualAudioDeviceMatch } from "./virtualAudioDevices.ts";
import { hasVirtualSystemAudioDevice } from "./virtualAudioCapture.ts";
import {
  MEDIA_RECORDER_NO_TRANSCRIPT_MESSAGE,
  MICROPHONE_UNAVAILABLE_MESSAGE,
} from "./audioCaptureTypes.ts";
import {
  canAttemptSystemAudioCapture,
  systemAudioListeningMessage,
} from "./systemAudioCapture.ts";
import type { GlassSttState } from "./sttTypes.ts";
import { STT_MIC_NOT_CONFIGURED_MESSAGE, sttStatusMessage } from "./sttTypes.ts";

export interface TranscriptionProviderSnapshot {
  selectedMode: TranscriptionMode;
  webSpeechAvailable: boolean;
  mediaRecorderAvailable: boolean;
  getUserMediaAvailable: boolean;
  getDisplayMediaAvailable: boolean;
  systemAudioStatus: SystemAudioStatus;
  systemAudioDetail?: string;
  systemAudioListening?: boolean;
  selectedVirtualAudioDeviceId?: string;
  virtualAudioDevices?: VirtualAudioDeviceMatch[];
  stt: GlassSttState;
}

export function detectWebSpeech(win?: Window): boolean {
  if (!win) return false;
  return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
}

export function detectMediaRecorder(): boolean {
  return typeof MediaRecorder !== "undefined";
}

export function detectGetUserMedia(): boolean {
  return !!(navigator.mediaDevices?.getUserMedia);
}

export function detectGetDisplayMedia(): boolean {
  return !!(navigator.mediaDevices?.getDisplayMedia);
}

export function usesSttChunkCapture(mode: TranscriptionMode): boolean {
  return mode === "microphone_media_recorder" || mode === "system_audio";
}

/** Pick the best mic mode when user selects Microphone. */
export function resolveMicrophoneMode(
  snapshot: Omit<TranscriptionProviderSnapshot, "selectedMode">,
): TranscriptionMode {
  if (snapshot.webSpeechAvailable) return "microphone_web_speech";
  if (snapshot.mediaRecorderAvailable && snapshot.getUserMediaAvailable) {
    return "microphone_media_recorder";
  }
  return "manual";
}

export function buildProviderSnapshot(
  selectedMode: TranscriptionMode,
  win?: Window,
  extras: {
    systemAudioStatus?: SystemAudioStatus;
    systemAudioDetail?: string;
    systemAudioListening?: boolean;
    selectedVirtualAudioDeviceId?: string;
    virtualAudioDevices?: VirtualAudioDeviceMatch[];
    stt?: GlassSttState;
  } = {},
): TranscriptionProviderSnapshot {
  const webSpeechAvailable = detectWebSpeech(win);
  const mediaRecorderAvailable = detectMediaRecorder();
  const getUserMediaAvailable = detectGetUserMedia();
  const getDisplayMediaAvailable = detectGetDisplayMedia();
  const defaultStt: GlassSttState = extras.stt ?? {
    provider: "openai",
    endpoint: "server",
    status: "configured",
    model: "gpt-4o-mini-transcribe",
    enabled: true,
    chunkMs: 20_000,
    autoStopEnabled: false,
    autoStopMs: 30 * 60 * 1000,
  };
  return {
    selectedMode,
    webSpeechAvailable,
    mediaRecorderAvailable,
    getUserMediaAvailable,
    getDisplayMediaAvailable,
    systemAudioStatus: extras.systemAudioStatus ?? "requires_permission",
    systemAudioDetail: extras.systemAudioDetail,
    systemAudioListening: extras.systemAudioListening,
    selectedVirtualAudioDeviceId: extras.selectedVirtualAudioDeviceId,
    virtualAudioDevices: extras.virtualAudioDevices,
    stt: defaultStt,
  };
}

export function modeStatusMessage(
  mode: TranscriptionMode,
  snapshot: TranscriptionProviderSnapshot,
): string {
  switch (mode) {
    case "system_audio":
      if (snapshot.systemAudioListening && snapshot.stt.enabled) {
        return "System audio capture active. Chunk transcription via OpenAI every ~20 seconds.";
      }
      if (snapshot.systemAudioListening && !snapshot.stt.enabled) {
        return `${systemAudioListeningMessage("available", true)} ${sttStatusMessage(snapshot.stt.status)}`;
      }
      return systemAudioListeningMessage(
        snapshot.systemAudioStatus,
        !!snapshot.systemAudioListening,
        snapshot.systemAudioDetail,
      );
    case "manual":
      return "Paste or type transcript manually.";
    case "microphone_web_speech":
      return snapshot.webSpeechAvailable
        ? "Microphone live transcription via Web Speech (not system audio)."
        : MICROPHONE_UNAVAILABLE_MESSAGE;
    case "microphone_media_recorder":
      return snapshot.stt.enabled
        ? "Microphone chunks sent to OpenAI STT every ~20 seconds."
        : STT_MIC_NOT_CONFIGURED_MESSAGE;
    default:
      return "";
  }
}

export function canStartListening(
  mode: TranscriptionMode,
  snapshot: TranscriptionProviderSnapshot,
): boolean {
  if (mode === "manual") return false;
  if (mode === "system_audio") {
    const hasVirtual = hasVirtualSystemAudioDevice({
      selectedVirtualAudioDeviceId: snapshot.selectedVirtualAudioDeviceId,
      virtualAudioDevices: snapshot.virtualAudioDevices,
    });
    if (!snapshot.getDisplayMediaAvailable && !hasVirtual) return false;
    return canAttemptSystemAudioCapture(snapshot.systemAudioStatus);
  }
  if (mode === "microphone_web_speech") return snapshot.webSpeechAvailable;
  if (mode === "microphone_media_recorder") {
    return snapshot.mediaRecorderAvailable && snapshot.getUserMediaAvailable;
  }
  return false;
}
