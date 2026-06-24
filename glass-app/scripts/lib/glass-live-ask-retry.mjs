/**
 * Transient-error detection for live Glass answer audit only.
 * Quality/routing failures must never be retried.
 */

/** @param {unknown} err @param {number} [httpStatus] */
export function isTransientLiveAskError(err, httpStatus = 0) {
  if (httpStatus >= 500 && httpStatus < 600) return true;
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (!msg) return false;
  if (msg.includes("timeout") || msg.includes("timed out")) return true;
  if (msg.includes("abort") || msg.includes("aborted")) return true;
  if (msg.includes("network") || msg.includes("econnreset") || msg.includes("etimedout")) return true;
  if (msg.includes("fetch failed") || msg.includes("socket hang up")) return true;
  if (/\b(502|503|504)\b/.test(msg)) return true;
  return false;
}

/** @param {unknown} err @param {number} [httpStatus] */
export function isNonRetryableLiveAskFailure(err, httpStatus = 0) {
  if (httpStatus >= 400 && httpStatus < 500) return true;
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  const nonRetry = [
    "stub canary",
    "council:",
    "too short",
    "empty answer",
    "bad route",
    "placeholder-only",
    "accidental capture",
    "text scenario routed",
    "quality failure",
    "wrong route",
    "model mismatch",
    "visual fixture",
  ];
  return nonRetry.some((p) => msg.includes(p));
}

/** @param {unknown} err @param {number} [httpStatus] @param {number} [attempt] */
export function shouldRetryLiveAsk(err, httpStatus = 0, attempt = 0) {
  if (attempt >= 1) return false;
  if (isNonRetryableLiveAskFailure(err, httpStatus)) return false;
  return isTransientLiveAskError(err, httpStatus);
}
