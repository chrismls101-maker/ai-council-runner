/**
 * Listen mode — no-audio prompt timing and dismiss cooldown.
 *
 * Pure — no electron / fs.
 */

/** Minimum quiet period before surfacing a no-audio prompt in Listen mode (minutes). */
export const LISTEN_SILENCE_TIMEOUT_MIN = 10;

/** After "Keep listening", suppress repeated no-audio prompts (ms). */
export const LISTEN_SILENCE_DISMISS_COOLDOWN_MS = 30 * 60_000;

export interface ListenSilencePromptInput {
  systemAudioActive: boolean;
  systemAudioLastSignalMs?: number;
  nowMs: number;
  isListenMode: boolean;
  defaultSilenceTimeoutMin: number;
  suppressedUntilMs?: number;
}

/** Whether the compact no-audio status should show. */
export function shouldShowListenSilencePrompt(input: ListenSilencePromptInput): boolean {
  if (!input.systemAudioActive) return false;
  if (input.systemAudioLastSignalMs == null) return false;
  if (input.suppressedUntilMs != null && input.nowMs < input.suppressedUntilMs) return false;

  const timeoutMin = input.isListenMode
    ? Math.max(input.defaultSilenceTimeoutMin, LISTEN_SILENCE_TIMEOUT_MIN)
    : input.defaultSilenceTimeoutMin;

  const elapsed = input.nowMs - input.systemAudioLastSignalMs;
  return elapsed >= timeoutMin * 60_000;
}
