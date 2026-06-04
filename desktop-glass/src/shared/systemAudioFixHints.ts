/**
 * User-facing system audio status messages and fix hints.
 */

import type { SystemAudioStatus } from "./systemAudioTypes.ts";
import { SYSTEM_AUDIO_STATUS_MESSAGES } from "./systemAudioTypes.ts";
import type { SttProviderStatus } from "./sttTypes.ts";
import { STT_MISSING_KEY_MESSAGE, STT_SERVER_UNAVAILABLE_MESSAGE } from "./sttTypes.ts";

export function systemAudioFixHint(status: SystemAudioStatus): string {
  switch (status) {
    case "requires_permission":
      return "How to fix: grant Screen Recording (and audio capture) for IIVO Glass in System Settings, then restart Glass.";
    case "requires_virtual_device":
      return "How to fix: route system audio through a virtual device (e.g. BlackHole), or use Microphone mode or manual transcript.";
    case "unsupported":
      return "How to fix: use Microphone mode or paste transcript manually on this OS.";
    case "available":
      return "System audio loopback is active. Transcription uses OpenAI when configured.";
    case "error":
      return "How to fix: try Stop Listening, restart Glass, or paste transcript manually.";
    default:
      return "";
  }
}

export function sttFixHint(status: SttProviderStatus): string {
  switch (status) {
    case "missing_key":
      return `How to fix: ${STT_MISSING_KEY_MESSAGE}`;
    case "server_unavailable":
      return "How to fix: run npm run dev so Glass can use /api/transcribe-audio, or set IIVO_GLASS_STT_ENDPOINT=direct with IIVO_GLASS_OPENAI_API_KEY.";
    case "disabled":
      return "How to fix: set IIVO_GLASS_STT_ENABLED=true and IIVO_GLASS_STT_ENDPOINT=direct (or server).";
    default:
      return "";
  }
}

export function systemAudioStatusWithHint(
  status: SystemAudioStatus,
  detail?: string,
): { message: string; hint: string } {
  if (status === "error") {
    return {
      message: detail?.trim() || "System audio capture failed.",
      hint: systemAudioFixHint("error"),
    };
  }
  return {
    message: SYSTEM_AUDIO_STATUS_MESSAGES[status],
    hint: systemAudioFixHint(status),
  };
}
