/**
 * Live Translate — startup grace before surfacing no-audio / STT errors.
 * Pure — no electron / fs.
 */

import { isSttNoSignalFailure } from "./sttTypes.ts";
import type { LiveTranslateCaptionLine, LiveTranslateRuntimeState } from "./liveTranslateTypes.ts";

/** Quiet period after translate start before no-audio / STT errors surface. */
export const TRANSLATE_SILENCE_GRACE_MS = 30_000;

export const TRANSLATE_WAITING_CAPTION = "Listening for audio...";

export function translateStartedAtMs(
  runtime: LiveTranslateRuntimeState | undefined,
): number | undefined {
  if (!runtime?.lastUpdatedAt) return undefined;
  const ms = Date.parse(runtime.lastUpdatedAt);
  return Number.isFinite(ms) ? ms : undefined;
}

export function isTranslateWaitingCaptionLine(line: LiveTranslateCaptionLine | undefined): boolean {
  if (!line) return false;
  const text = line.translated.trim().toLowerCase();
  return (
    text === TRANSLATE_WAITING_CAPTION.toLowerCase() ||
    text === "listening for audio…" ||
    (line.original.trim() === "" && text.startsWith("listening for audio"))
  );
}

export function isWithinTranslateSilenceGrace(
  runtime: LiveTranslateRuntimeState | undefined,
  nowMs = Date.now(),
  graceUntilMs?: number,
): boolean {
  if (graceUntilMs != null && nowMs < graceUntilMs) return true;
  if (!runtime?.active || !runtime.config.enabled) return false;
  const started = translateStartedAtMs(runtime);
  if (started == null) return true;
  return nowMs - started < TRANSLATE_SILENCE_GRACE_MS;
}

export function hasTranslateMeaningfulCaptionSignal(
  runtime: LiveTranslateRuntimeState | undefined,
): boolean {
  const line = runtime?.captions.current;
  if (!line) return false;
  if (isTranslateWaitingCaptionLine(line)) return false;
  return Boolean(line.original.trim() || line.translated.trim());
}

export function hasTranslateMeaningfulSignal(
  runtime: LiveTranslateRuntimeState | undefined,
  systemAudioLastSignalMs?: number,
): boolean {
  if (hasTranslateMeaningfulCaptionSignal(runtime)) return true;
  const started = translateStartedAtMs(runtime);
  if (
    started != null &&
    systemAudioLastSignalMs != null &&
    systemAudioLastSignalMs > started
  ) {
    return true;
  }
  return false;
}

/** Errors that must surface immediately even during translate startup grace. */
export function isTranslateHardError(error: string | undefined): boolean {
  if (!error?.trim()) return false;
  const lower = error.toLowerCase();
  if (lower.includes("permission denied")) return true;
  if (/not configured|missing.*key|api key|iivo_glass_openai_api_key/i.test(error)) return true;
  return false;
}

export function shouldSuppressTranslateStartupError(input: {
  runtime?: LiveTranslateRuntimeState;
  error?: string;
  nowMs?: number;
  systemAudioLastSignalMs?: number;
  /** Main-process grace deadline (covers IPC race before runtime.active). */
  graceUntilMs?: number;
  /** Renderer-side translate intent before IPC round-trip. */
  translateListeningIntent?: boolean;
}): boolean {
  const nowMs = input.nowMs ?? Date.now();
  const { runtime, error, systemAudioLastSignalMs, graceUntilMs, translateListeningIntent } =
    input;

  if (isTranslateHardError(error)) return false;

  const translateActive =
    Boolean(runtime?.active && runtime.config.enabled) ||
    Boolean(translateListeningIntent) ||
    (graceUntilMs != null && nowMs < graceUntilMs);

  if (!translateActive) return false;
  if (hasTranslateMeaningfulSignal(runtime, systemAudioLastSignalMs)) return false;

  if (isWithinTranslateSilenceGrace(runtime, nowMs, graceUntilMs)) return true;
  if (translateListeningIntent && isWithinTranslateSilenceGrace(runtime, nowMs)) return true;

  return Boolean(runtime?.active && isSttNoSignalFailure(error));
}
