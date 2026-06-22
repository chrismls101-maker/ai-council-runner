/**
 * Glass Companion — shared types and pure helpers (no Electron / DOM).
 *
 * Companion is a strip-toggle voice session: Aletheia speaks via Matilda (ElevenLabs)
 * and drives spatial overlay manifestations on screen.
 */

import type { GlassLastAskResponse } from "./glassAskTypes.ts";
import { lastAskResponseBody } from "./glassAskTypes.ts";
import { formatOverlayAnswerText } from "./glassAskTypes.ts";
import type { VoiceModeStatus } from "./voiceModeState.ts";
import { voiceModeStatusLabel } from "./voiceModeActions.ts";
import type { SystemAudioStatus } from "./systemAudioTypes.ts";
import type { VirtualAudioDeviceMatch } from "./virtualAudioDevices.ts";
import { shouldUseVirtualSystemAudioCapture } from "./virtualAudioCapture.ts";

/** Glass Companion identity — intelligence of IIVO Glass (voice: Matilda). */
export const ALETHEIA_IDENTITY_NAME = "Aletheia";

/** Shown while Companion waits for ElevenLabs before a visual capture. */
export const COMPANION_LOOKING_SPEECH = "One moment, let me look at your screen.";

/** Spoken while OmniParser sidecar warms on Companion toggle (once per cold start). */
export const COMPANION_WARMING_SPEECH = "One moment — I'm opening my sight.";

/** Spoken once per session when sight is ready after a warm-up. */
export const COMPANION_READY_SPEECH =
  "I'm Aletheia. I'm with you — what do you need?";

/** Bridge between visual capture and answer TTS — fills the thinking gap. */
export const COMPANION_THINKING_SPEECH = "Mm — let me think on that.";

/** Once per Aletheia session when parallel machine-audio listening starts. */
export const COMPANION_MACHINE_AUDIO_DISCLOSURE =
  "I can hear your screen audio — I'll only speak when you ask me something.";

/** Max delay before retrying mic listen after repeated failures. */
export const COMPANION_LISTEN_RESTART_MAX_BACKOFF_MS = 8000;

/** Base delay for exponential listen restart backoff. */
export const COMPANION_LISTEN_RESTART_BASE_MS = 400;

/** Default cap for spoken answers — keeps TTS latency reasonable in Phase 1. */
export const COMPANION_TTS_MAX_CHARS = 600;

/**
 * Text Aletheia should read for a completed ask.
 * Prefers shortAnswer; otherwise trims markdown from the full body.
 */
export function companionSpeechTextFromResponse(
  response: GlassLastAskResponse | null | undefined,
  maxChars: number = COMPANION_TTS_MAX_CHARS,
): string {
  if (!response) return "";
  const preferred = response.shortAnswer?.trim() || lastAskResponseBody(response);
  if (!preferred) return "";
  const plain = formatOverlayAnswerText(preferred)
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxChars) return plain;
  const cut = plain.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.trim()}…`;
}

/** Human-readable strip status while Aletheia (Companion) is active. */
export function companionStatusLabel(
  status: VoiceModeStatus,
  options?: {
    speaking?: boolean;
    scriptLabel?: string | null;
    /** Parallel system-audio transcription while Aletheia listens on mic. */
    hearingMachineAudio?: boolean;
  },
): string {
  if (options?.scriptLabel) return options.scriptLabel;
  if (options?.speaking) return "Aletheia · Speaking";
  const inner = voiceModeStatusLabel(status);
  if (!inner) return "Aletheia · On";
  const innerPlain = inner.replace(/…$/, "");
  let label = `Aletheia · ${innerPlain}`;
  if (options?.hearingMachineAudio && innerPlain === "Listening") {
    label = "Aletheia · Listening · + audio";
  }
  return label;
}

/** Auto-start machine audio for Aletheia when a virtual loopback device is configured. */
export function shouldAutoStartCompanionSystemAudio(input: {
  systemAudioStatus?: SystemAudioStatus;
  selectedVirtualAudioDeviceId?: string;
  virtualAudioDevices?: VirtualAudioDeviceMatch[];
}): boolean {
  if (input.systemAudioStatus === "available") return true;
  return shouldUseVirtualSystemAudioCapture({
    selectedVirtualAudioDeviceId: input.selectedVirtualAudioDeviceId,
    virtualAudioDevices: input.virtualAudioDevices,
  });
}

/** User explicitly asked for a long / detailed answer (follow-up to short vs long). */
export function companionUserWantsDepth(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  const explicitDepth =
    /\b(long|full|detailed|in depth|go deep|more detail|deep dive|the long version|full version|tell me everything|full picture|break this down|break it down)\b/i.test(
      text,
    );
  const affirmsDepth =
    /\b(yes|yeah|sure|please|do it|go ahead)\b/i.test(text) &&
    /\b(deep|long|full|detail|everything)\b/i.test(text);
  return explicitDepth || affirmsDepth;
}

/** Prompt looks like a generative or planning task that should use the Response Panel. */
export function companionPrefersResponsePanel(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  if (companionUserWantsDepth(text)) return true;
  return (
    /\b(generate|write me|draft|create a|compose|outline|plan out|design a|build me|produce a|architect|spec out)\b/i.test(
      text,
    ) ||
    /\b(explain .+ (in detail|thoroughly)|comprehensive|step-by-step guide|full breakdown|walk me through .+ in detail|give me the full)\b/i.test(
      text,
    )
  );
}
