import type { ContextItem } from "../contextBridge/types.js";

const VISUAL_ANALYSIS_PATTERNS = [
  /\banalyze this screenshot\b/i,
  /\bwhat do you see\b/i,
  /\blook at this\b/i,
  /\breview this design\b/i,
  /\bwhat stands out visually\b/i,
  /\bscreenshot\b/i,
  /\bvisually\b/i,
  /\bwhat matters\b/i,
  /\bwhat stands out\b/i,
];

export function promptRequestsVisualAnalysis(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  return VISUAL_ANALYSIS_PATTERNS.some((pattern) => pattern.test(text));
}

export function shouldUseVisionDirectAnswer(
  prompt: string,
  screenshotItems: Pick<ContextItem, "type">[],
): boolean {
  if (screenshotItems.length === 0) return false;
  return promptRequestsVisualAnalysis(prompt);
}
