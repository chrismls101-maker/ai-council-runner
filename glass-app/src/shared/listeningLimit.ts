/**
 * Max listening duration enforcement — privacy, cost, and battery control.
 *
 * Pure logic only; main process owns timers and stream stop.
 */

/** Extra minutes granted when the user taps "Continue 15 min". */
export const LISTENING_LIMIT_CONTINUE_MIN = 15;

/** Auto-stop listening if the user does not respond to the limit card. */
export const LISTENING_LIMIT_RESPONSE_TIMEOUT_MS = 60_000;

export interface ListeningLimitState {
  /** Extra milliseconds granted by "Continue 15 min". */
  extensionMs: number;
  /** Whether the limit card is visible. */
  limitReached: boolean;
  /** When the limit card was shown (for response timeout). */
  limitReachedAtMs?: number;
}

export function createListeningLimitState(): ListeningLimitState {
  return { extensionMs: 0, limitReached: false };
}

export function resetListeningLimitState(): ListeningLimitState {
  return createListeningLimitState();
}

/** True when max listening duration enforcement is enabled. */
export function isListeningLimitEnabled(maxListeningMin: number): boolean {
  return maxListeningMin > 0;
}

export function listeningLimitMs(maxListeningMin: number): number {
  return maxListeningMin * 60_000;
}

export function effectiveListeningLimitMs(maxListeningMin: number, extensionMs: number): number {
  if (!isListeningLimitEnabled(maxListeningMin)) return Number.POSITIVE_INFINITY;
  return listeningLimitMs(maxListeningMin) + extensionMs;
}

/** Whether elapsed listening time has hit the configured cap. */
export function shouldTriggerListeningLimit(opts: {
  elapsedMs: number;
  maxListeningMin: number;
  extensionMs: number;
  limitReached: boolean;
  listening: boolean;
}): boolean {
  if (!opts.listening || opts.limitReached) return false;
  if (!isListeningLimitEnabled(opts.maxListeningMin)) return false;
  return opts.elapsedMs >= effectiveListeningLimitMs(opts.maxListeningMin, opts.extensionMs);
}

export function markListeningLimitReached(
  state: ListeningLimitState,
  nowMs: number,
): ListeningLimitState {
  return { ...state, limitReached: true, limitReachedAtMs: nowMs };
}

export function extendListeningLimit(state: ListeningLimitState): ListeningLimitState {
  return {
    extensionMs: state.extensionMs + LISTENING_LIMIT_CONTINUE_MIN * 60_000,
    limitReached: false,
    limitReachedAtMs: undefined,
  };
}

export function shouldAutoStopListeningLimit(
  state: ListeningLimitState,
  nowMs: number,
  timeoutMs = LISTENING_LIMIT_RESPONSE_TIMEOUT_MS,
): boolean {
  if (!state.limitReached || state.limitReachedAtMs == null) return false;
  return nowMs - state.limitReachedAtMs >= timeoutMs;
}

export const LISTENING_LIMIT_CARD_TITLE = "Listening limit reached. Continue?";
export const LISTENING_LIMIT_CARD_BODY =
  "You reached the max listening duration. Continue for 15 more minutes or stop now.";
