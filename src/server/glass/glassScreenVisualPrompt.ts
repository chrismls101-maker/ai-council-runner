/**
 * Screen/visual intent detection for IIVO Glass command-bar asks.
 */

import { promptRequestsVisualAnalysis } from "../agents/visionRouting.js";

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
  if (GLASS_SCREEN_VISUAL_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }
  return promptRequestsVisualAnalysis(text);
}
