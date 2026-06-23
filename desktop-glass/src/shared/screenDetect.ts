/**
 * Screen-aware file detection — shared timeout + cache constants.
 */

import type { AgentScreenContext } from "./ipc.ts";

export const SCREEN_DETECT_TIMEOUT_MS = 2_000;
export const SCREEN_DETECT_CACHE_MS = 30_000;

export function lowConfidenceScreenContext(): AgentScreenContext {
  return { confidence: "low" };
}

/** Resolve when detect completes or timeoutMs elapses (whichever comes first). */
export function screenDetectTimeout<T>(
  detect: () => Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, timeoutMs);

    void detect()
      .then((result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

export function isFreshScreenContext(
  detectedAt: number | undefined,
  maxAgeMs = SCREEN_DETECT_CACHE_MS,
): boolean {
  if (detectedAt == null || !Number.isFinite(detectedAt)) return false;
  return Date.now() - detectedAt < maxAgeMs;
}
