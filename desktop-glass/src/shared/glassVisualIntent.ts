/**
 * Visual/screen intent for Glass command-bar asks (shared, no Electron).
 */

/** Fallback to last capture only within this window (ms). */
export const GLASS_VISUAL_FALLBACK_MAX_AGE_MS = 60_000;

/** Status display for older captures (ms). */
export const GLASS_SCREEN_CONTEXT_DISPLAY_MAX_AGE_MS = 30 * 60 * 1000;

const GLASS_SCREEN_VISUAL_PATTERNS = [
  /\bwhat'?s on (?:my |the )?screen\b/i,
  /\bwhat am i looking at\b/i,
  /\bwhat do you see\b/i,
  /\bwhat am i working on\b/i,
  /\bread this\b/i,
  /\bread this error\b/i,
  /\bexplain (?:this |the )?screen\b/i,
  /\bexplain what'?s on (?:my |the )?screen\b/i,
  /\bsummarize this (?:page|screen)\b/i,
  /\bwhat should i do (?:with this page|here)\b/i,
  /\bwhat is this\b/i,
  /\blook at this\b/i,
  /\bhelp me with this screen\b/i,
  /\bwhat does this error mean\b/i,
  /\bwhat should i do with this page\b/i,
  /\bsummarize this screen\b/i,
  /\bon (?:my |the )?screen\b/i,
  /\bthis (?:page|screen|window|ui|error)\b/i,
  /\bwhat'?s (?:shown|displayed|visible)\b/i,
];

export function promptRequestsGlassScreenVisual(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  return GLASS_SCREEN_VISUAL_PATTERNS.some((pattern) => pattern.test(text));
}

export function isRecentGlassCapture(
  capturedAt: string,
  nowMs = Date.now(),
  maxAgeMs = GLASS_SCREEN_CONTEXT_DISPLAY_MAX_AGE_MS,
): boolean {
  const t = Date.parse(capturedAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= maxAgeMs;
}

export function isFallbackGlassCapture(capturedAt: string, nowMs = Date.now()): boolean {
  return isRecentGlassCapture(capturedAt, nowMs, GLASS_VISUAL_FALLBACK_MAX_AGE_MS);
}

export function formatCaptureAgeSeconds(capturedAt: string, nowMs = Date.now()): number | undefined {
  const ageMs = nowMs - Date.parse(capturedAt);
  if (!Number.isFinite(ageMs)) return undefined;
  return Math.max(0, Math.round(ageMs / 1000));
}
