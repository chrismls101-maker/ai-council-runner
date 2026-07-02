/**
 * Glass Guide — orientation speech scheduling.
 *
 * Single TTS fetch per line (Fix 11): the audio buffer is fetched once (with
 * character timestamps when ElevenLabs is configured), shipped to the overlay
 * for playback, and reused for duration + word-level sync. A cancel handle
 * stops audio mid-word on Skip/dismiss. When no TTS key is configured the
 * presenter advances on a word-count heuristic instead of stalling.
 */

import type { CharacterAlignment } from "../shared/ttsAlignment.ts";
import { wordTimingsFromAlignment } from "../shared/ttsAlignment.ts";
import type { OrientationSpeakPayload } from "../shared/liveOrientationTypes.ts";

/** Legacy simple fetch (audio only) — kept for hosts without timestamp support. */
export type OrientationTtsFetch = (text: string) => Promise<Buffer | null>;

/** Timed fetch — audio + character alignment in one call. */
export type OrientationTimedTtsFetch = (
  text: string,
) => Promise<{ audio: Buffer; alignment: CharacterAlignment | null } | null>;

export type OrientationSpeechTransport = {
  /** Broadcast the fetched buffer to the overlay for playback. */
  play: (payload: OrientationSpeakPayload) => void;
  /** Stop in-flight playback immediately (mid-word). */
  cancel: (nonce: number) => void;
};

/** No-TTS advance heuristic (ms per word). */
export const ORIENTATION_WORDS_FALLBACK_MS = 280;
/** Grace beyond the estimated duration before we stop waiting on the renderer. */
const SPEECH_DONE_GRACE_MS = 2_500;

let transport: OrientationSpeechTransport | null = null;
let speechNonce = 0;
const pendingDone = new Map<number, () => void>();

export function configureOrientationSpeechTransport(next: OrientationSpeechTransport): void {
  transport = next;
}

/** Called from the IPC layer when the overlay finishes (or fails) playback. */
export function notifyOrientationSpeechDone(nonce: number): void {
  pendingDone.get(nonce)?.();
}

/** Estimate MP3 playback duration from buffer size (128kbps CBR approximation). */
export function estimateMp3DurationMs(buffer: Buffer | null, text: string): number {
  if (buffer && buffer.length > 0) {
    const bytesPerSecond = (128 * 1000) / 8;
    return Math.max(1500, Math.round((buffer.length / bytesPerSecond) * 1000) + 300);
  }
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1200, words * ORIENTATION_WORDS_FALLBACK_MS);
}

export type ScheduledOrientationSpeech = {
  nonce: number;
  /** Best-known playback duration. Exact when alignment is present. */
  durationMs: number;
  /** True when a real audio buffer is playing (vs silent heuristic). */
  hasAudio: boolean;
  alignment: CharacterAlignment | null;
  /**
   * Ms into playback at which `phrase` is spoken (word-level sync). Falls back
   * to 0 when alignment or the phrase is unavailable.
   */
  timestampForPhrase: (phrase: string) => number;
  /** Resolves when playback ends, is cancelled, or times out. */
  done: Promise<void>;
  /** Stop audio mid-word and resolve `done`. */
  cancel: () => void;
};

/**
 * Fetch once, play through the overlay, expose duration/word timestamps and a
 * cancel handle. Never fetches the same line twice.
 */
export async function scheduleOrientationSpeech(
  text: string,
  fetchTts: OrientationTimedTtsFetch,
  signal?: AbortSignal,
): Promise<ScheduledOrientationSpeech> {
  const trimmed = text.trim();
  const nonce = ++speechNonce;

  const noop: ScheduledOrientationSpeech = {
    nonce,
    durationMs: 0,
    hasAudio: false,
    alignment: null,
    timestampForPhrase: () => 0,
    done: Promise.resolve(),
    cancel: () => {},
  };
  if (!trimmed || signal?.aborted) return noop;

  let fetched: { audio: Buffer; alignment: CharacterAlignment | null } | null = null;
  try {
    fetched = await fetchTts(trimmed);
  } catch {
    fetched = null;
  }
  if (signal?.aborted) return noop;

  const alignment = fetched?.alignment ?? null;
  const durationMs = alignment
    ? Math.max(
        1200,
        Math.round(
          (alignment.character_end_times_seconds[alignment.character_end_times_seconds.length - 1] ?? 0)
            * 1000,
        ) + 200,
      )
    : fetched
      ? estimateMp3DurationMs(fetched.audio, trimmed)
      : estimateMp3DurationMs(null, trimmed);

  let settled = false;
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = () => {
      if (settled) return;
      settled = true;
      pendingDone.delete(nonce);
      resolve();
    };
  });
  pendingDone.set(nonce, resolveDone);

  // Renderer may never answer (window gone, decode failure) — always time out.
  const timeout = setTimeout(resolveDone, durationMs + SPEECH_DONE_GRACE_MS);
  void done.then(() => clearTimeout(timeout));

  if (fetched) {
    transport?.play({
      nonce,
      text: trimmed,
      audioBase64: fetched.audio.toString("base64"),
    });
  } else {
    // Silent (no key / fetch failed): caption only; advance on the heuristic.
    transport?.play({ nonce, text: trimmed, audioBase64: null });
    setTimeout(resolveDone, durationMs);
  }

  const timestampForPhrase = (phrase: string): number => {
    if (!alignment || !phrase.trim()) return 0;
    const haystack = alignment.characters.join("").toLowerCase();
    const needle = phrase.trim().toLowerCase();
    const idx = haystack.indexOf(needle);
    if (idx < 0) {
      // Fall back to first word of the phrase.
      const firstWord = needle.split(/\s+/)[0] ?? "";
      const words = wordTimingsFromAlignment(alignment);
      const hit = words.find((w) => w.word.toLowerCase().includes(firstWord));
      return hit ? Math.round(hit.start * 1000) : 0;
    }
    return Math.round((alignment.character_start_times_seconds[idx] ?? 0) * 1000);
  };

  return {
    nonce,
    durationMs,
    hasAudio: fetched != null,
    alignment,
    timestampForPhrase,
    done,
    cancel: () => {
      transport?.cancel(nonce);
      resolveDone();
    },
  };
}
