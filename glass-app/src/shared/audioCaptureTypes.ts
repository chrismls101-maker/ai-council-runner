/**
 * Audio/transcription capture modes for IIVO Glass.
 */

import type { SystemAudioStatus } from "./systemAudioTypes.ts";

export type TranscriptionMode =
  | "manual"
  | "microphone_web_speech"
  | "microphone_media_recorder"
  | "system_audio";

export type TranscriptionStatus = "idle" | "listening" | "paused";

export const TRANSCRIPTION_MODE_LABELS: Record<TranscriptionMode, string> = {
  manual: "Manual Paste",
  microphone_web_speech: "Microphone",
  microphone_media_recorder: "Microphone (record only)",
  system_audio: "System Audio",
};

export const MICROPHONE_UNAVAILABLE_MESSAGE =
  "Microphone transcription is not available in this build. Paste transcript manually.";

export const MEDIA_RECORDER_NO_TRANSCRIPT_MESSAGE =
  "Microphone is recording locally. Live transcription requires Web Speech or manual paste.";

export type { SystemAudioStatus };
