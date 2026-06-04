/**
 * Transcription provider detection and mode resolution for IIVO Glass.
 */

import type { TranscriptionMode, SystemAudioStatus } from "./audioCaptureTypes.ts";
import {
  MEDIA_RECORDER_NO_TRANSCRIPT_MESSAGE,
  MICROPHONE_UNAVAILABLE_MESSAGE,
} from "./audioCaptureTypes.ts";
import {
  canAttemptSystemAudioCapture,
  systemAudioListeningMessage,
} from "./systemAudioCapture.ts";

export interface TranscriptionProviderSnapshot {
  selectedMode: TranscriptionMode;
  webSpeechAvailable: boolean;
  mediaRecorderAvailable: boolean;
  getUserMediaAvailable: boolean;
  systemAudioStatus: SystemAudioStatus;
  systemAudioDetail?: string;
  systemAudioListening?: boolean;
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
  systemAudio: Pick<
    TranscriptionProviderSnapshot,
    "systemAudioStatus" | "systemAudioDetail" | "systemAudioListening"
  > = { systemAudioStatus: "requires_permission" },
): TranscriptionProviderSnapshot {
  const webSpeechAvailable = detectWebSpeech(win);
  const mediaRecorderAvailable = detectMediaRecorder();
  const getUserMediaAvailable = detectGetUserMedia();
  return {
    selectedMode,
    webSpeechAvailable,
    mediaRecorderAvailable,
    getUserMediaAvailable,
    ...systemAudio,
  };
}

export function modeStatusMessage(
  mode: TranscriptionMode,
  snapshot: TranscriptionProviderSnapshot,
): string {
  switch (mode) {
    case "system_audio":
      return systemAudioListeningMessage(
        snapshot.systemAudioStatus,
        !!snapshot.systemAudioListening,
        snapshot.systemAudioDetail,
      );
    case "manual":
      return "Paste or type transcript manually.";
    case "microphone_web_speech":
      return snapshot.webSpeechAvailable
        ? "Microphone listening uses Web Speech (not system audio)."
        : MICROPHONE_UNAVAILABLE_MESSAGE;
    case "microphone_media_recorder":
      return MEDIA_RECORDER_NO_TRANSCRIPT_MESSAGE;
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
    if (!detectGetDisplayMedia()) return false;
    return canAttemptSystemAudioCapture(snapshot.systemAudioStatus);
  }
  if (mode === "microphone_web_speech") return snapshot.webSpeechAvailable;
  if (mode === "microphone_media_recorder") {
    return snapshot.mediaRecorderAvailable && snapshot.getUserMediaAvailable;
  }
  return false;
}
