/**
 * Visual/screen intent for Glass command-bar and voice asks (shared, no Electron).
 */

/** Fallback to last capture only within this window (ms). */
export const GLASS_VISUAL_FALLBACK_MAX_AGE_MS = 60_000;

/** Status display for older captures (ms). */
export const GLASS_SCREEN_CONTEXT_DISPLAY_MAX_AGE_MS = 30 * 60 * 1000;

/** General reasoning — use text/session context, not capture-first visual. */
export const GLASS_GENERAL_TEXT_PATTERNS = [
  /\bwhat matters here\b/i,
  /\bwhat should i do next\b/i,
  /\bturn this into action steps\b/i,
  /\bwhat is the risk\b/i,
  /\bwhat did i miss\b/i,
  /\bsummarize the session\b/i,
  /^summarize this[?.!]?$/i,
  /\bgive me the report\b/i,
  /\bcreate an ai prompt\b/i,
  /\bcreate content hooks\b/i,
  /\bdiagnose what keeps failing\b/i,
  /\bwhat should i remember\b/i,
];

export const GLASS_EXPLICIT_SCREEN_VISUAL_PATTERNS = [
  /\bwhat do you see on (?:my |the )?screen\b/i,
  /\bwhat'?s on (?:my |the )?screen\b/i,
  /\bwhat'?s on this page\b/i,
  /\bwhat does this screen say\b/i,
  /\bwhat am i looking at\b/i,
  /\bread this error\b/i,
  /\blook at this\b/i,
  /\bexplain (?:this |the )?screen\b/i,
  /\bexplain what'?s on (?:my |the )?screen\b/i,
  /\bsummarize this (?:page|screen)\b/i,
  /\bwhat should i do with this page\b/i,
  /\bhelp me with this screen\b/i,
  /\bwhat does this error mean\b/i,
  /\bon (?:my |the )?screen\b/i,
  /\bthis error\b/i,
];

export function promptRequestsGeneralGlassText(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  return GLASS_GENERAL_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

export function promptRequestsExplicitScreenVisual(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  return GLASS_EXPLICIT_SCREEN_VISUAL_PATTERNS.some((pattern) => pattern.test(text));
}

export function promptRequestsGlassScreenVisual(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  if (promptRequestsGeneralGlassText(text)) return false;
  return promptRequestsExplicitScreenVisual(text);
}

export interface ResolveGlassVisualOptions {
  visualIntent?: boolean;
  hasInlineScreenshot?: boolean;
}

export function resolveGlassAskUsesVisual(
  prompt: string,
  opts: ResolveGlassVisualOptions = {},
): boolean {
  if (opts.visualIntent === true) return true;
  const text = prompt.trim();
  if (!text) return false;
  if (promptRequestsGeneralGlassText(text)) return false;
  if (promptRequestsExplicitScreenVisual(text)) return true;
  if (
    opts.hasInlineScreenshot &&
    /\b(read|look|see|screen|page|error)\b/i.test(text) &&
    !promptRequestsGeneralGlassText(text)
  ) {
    return true;
  }
  return false;
}

export function shouldCaptureScreenForGlassAsk(prompt: string, visualIntent?: boolean): boolean {
  if (visualIntent === true) return true;
  return promptRequestsExplicitScreenVisual(prompt);
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

/** Clear error shown when a fresh capture is impossible (no fake answer). */
export const GLASS_VISUAL_CAPTURE_PERMISSION_MESSAGE =
  "I couldn't capture the screen. Check Screen Recording permission in System Settings, then try again.";

/** Clearly-labeled fallback notice when reusing the last recent capture. */
export function fallbackCaptureWarning(ageSeconds: number): string {
  return `Using your last capture from ${Math.max(0, Math.round(ageSeconds))}s ago.`;
}
