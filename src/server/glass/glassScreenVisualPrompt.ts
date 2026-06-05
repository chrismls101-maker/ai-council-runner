/**
 * Screen/visual intent detection for IIVO Glass command-bar and voice asks.
 * General session questions stay on glass_direct; explicit screen phrases trigger visual.
 */

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

/** Explicit screen/visual phrasing — may trigger capture or glass_visual_direct. */
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

/**
 * Whether the ask should use the visual route (existing screenshot or capture flow).
 * Does not force capture when only general text intent is present.
 */
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

/** Main-process capture should run only for explicit screen intent (not general text). */
export function shouldCaptureScreenForGlassAsk(prompt: string, visualIntent?: boolean): boolean {
  if (visualIntent === true) return true;
  return promptRequestsExplicitScreenVisual(prompt);
}
