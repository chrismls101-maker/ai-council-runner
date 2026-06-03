/**
 * Audio/transcription capture modes for IIVO Glass.
 * System audio is explicitly unavailable until truly implemented.
 */

export type TranscriptionMode =
  | "manual"
  | "microphone_web_speech"
  | "microphone_media_recorder"
  | "system_audio_unavailable";

export type TranscriptionStatus = "idle" | "listening" | "paused";

export const TRANSCRIPTION_MODE_LABELS: Record<TranscriptionMode, string> = {
  manual: "Manual Paste",
  microphone_web_speech: "Microphone",
  microphone_media_recorder: "Microphone (record only)",
  system_audio_unavailable: "System Audio — Not available yet",
};

export const SYSTEM_AUDIO_UNAVAILABLE_MESSAGE =
  "System audio capture is not implemented yet.";

export const MICROPHONE_UNAVAILABLE_MESSAGE =
  "Microphone transcription is not available in this build. Paste transcript manually.";

export const MEDIA_RECORDER_NO_TRANSCRIPT_MESSAGE =
  "Microphone is recording locally. Live transcription requires Web Speech or manual paste.";
