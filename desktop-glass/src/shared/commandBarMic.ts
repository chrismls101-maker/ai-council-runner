/**
 * Command bar microphone input helpers (ChatGPT-style mic → text).
 */

import type { TranscriptionMode } from "./audioCaptureTypes.ts";
import type { MicPermissionReport } from "./glassCapabilities.ts";

export const MIC_PERMISSION_DENIED_MESSAGE = "Microphone permission denied";
export const MIC_PERMISSION_DENIED_DETAIL =
  "Open Microphone Settings, allow IIVO Glass, then tap the mic again.";

export const DEFAULT_MIC_AUTO_SEND_SILENCE_MS = 2500;

export function isMicrophoneCaptureMode(
  selectedMode: TranscriptionMode,
  effectiveMode: TranscriptionMode,
): boolean {
  return (
    selectedMode === "microphone_web_speech" ||
    selectedMode === "microphone_media_recorder" ||
    effectiveMode === "microphone_web_speech" ||
    effectiveMode === "microphone_media_recorder"
  );
}

export function isSystemAudioCaptureMode(
  selectedMode: TranscriptionMode,
  effectiveMode: TranscriptionMode,
): boolean {
  return selectedMode === "system_audio" || effectiveMode === "system_audio";
}

/** Merge typed prefix, finalized speech, and live interim into command bar text. */
export function composeCommandBarMicText(
  prefix: string,
  finalized: string,
  interim?: string,
): string {
  const head = [prefix.trim(), finalized.trim()].filter(Boolean).join(prefix.trim() && finalized.trim() ? " " : "");
  const tail = interim?.trim() ?? "";
  if (!head) return tail;
  if (!tail) return head;
  return `${head} ${tail}`;
}

export function shouldShowMicPermissionDenied(opts: {
  micPermission: MicPermissionReport;
  lastError?: string;
}): boolean {
  if (opts.micPermission === "denied") return true;
  return !!opts.lastError?.toLowerCase().includes("permission denied");
}

export function micPermissionDeniedMessage(lastError?: string): string {
  if (lastError?.trim()) return lastError.trim();
  return MIC_PERMISSION_DENIED_MESSAGE;
}

/** True when Web Speech paused long enough to auto-send (optional setting). */
export function shouldAutoSendMicAfterSilence(
  enabled: boolean,
  draftText: string,
): boolean {
  return enabled && draftText.trim().length > 0;
}

/** Text to send with Ask after mic capture. */
export function buildAskTextFromMicDraft(
  prefix: string,
  finalized: string,
  interim?: string,
): string {
  return composeCommandBarMicText(prefix, finalized, interim).trim();
}
