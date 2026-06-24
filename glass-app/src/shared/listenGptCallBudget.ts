/**
 * GPT call budget + transient retry for long Listen endurance runs.
 */

export const DEFAULT_GPT_BACKOFF_MS = 30_000;
export const MAX_GPT_RETRY_ATTEMPTS = 1;

export interface GptCallBudgetState {
  maxPerHour: number;
  hourStartMs: number;
  callsThisHour: number;
  backoffUntilMs: number;
  totalCalls: number;
  transientFailures: number;
  cappedSkips: number;
}

export function createGptCallBudgetState(maxPerHour: number, nowMs = Date.now()): GptCallBudgetState {
  return {
    maxPerHour: Math.max(1, maxPerHour),
    hourStartMs: nowMs,
    callsThisHour: 0,
    backoffUntilMs: 0,
    totalCalls: 0,
    transientFailures: 0,
    cappedSkips: 0,
  };
}

function rollHour(state: GptCallBudgetState, nowMs: number): GptCallBudgetState {
  if (nowMs - state.hourStartMs < 3_600_000) return state;
  return { ...state, hourStartMs: nowMs, callsThisHour: 0 };
}

export function canMakeGptCall(state: GptCallBudgetState, nowMs: number): boolean {
  const rolled = rollHour(state, nowMs);
  if (nowMs < rolled.backoffUntilMs) return false;
  return rolled.callsThisHour < rolled.maxPerHour;
}

export function recordGptCall(state: GptCallBudgetState, nowMs: number): GptCallBudgetState {
  const rolled = rollHour(state, nowMs);
  if (rolled.callsThisHour >= rolled.maxPerHour) {
    return { ...rolled, cappedSkips: rolled.cappedSkips + 1 };
  }
  return {
    ...rolled,
    callsThisHour: rolled.callsThisHour + 1,
    totalCalls: rolled.totalCalls + 1,
  };
}

export function recordGptTransientFailure(
  state: GptCallBudgetState,
  nowMs: number,
  backoffMs = DEFAULT_GPT_BACKOFF_MS,
): GptCallBudgetState {
  return {
    ...state,
    transientFailures: state.transientFailures + 1,
    backoffUntilMs: nowMs + backoffMs,
  };
}

export function clearGptBackoff(state: GptCallBudgetState): GptCallBudgetState {
  return { ...state, backoffUntilMs: 0 };
}

export function isTransientEnduranceError(err: unknown, httpStatus = 0): boolean {
  if (httpStatus >= 500 && httpStatus < 600) return true;
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("fetch failed") ||
    msg.includes("503") ||
    msg.includes("502")
  );
}

export function shouldRetryEnduranceAsk(err: unknown, attempt: number, httpStatus = 0): boolean {
  if (attempt >= MAX_GPT_RETRY_ATTEMPTS) return false;
  return isTransientEnduranceError(err, httpStatus);
}
