/**
 * Visual ask quality presets and frame mode selection (shared).
 */

import { promptNeedsTextClarityVisual } from "./visualImageOptimizerConfig.ts";
import type { VisualFrameMode } from "./visualImageCrop.ts";

export type VisualQualityPreset = "general" | "text" | "aggressive";

const CODE_ERROR_PATTERNS = [
  /\bexplain this error\b/i,
  /\bwhat is this code error\b/i,
  /\bwhat'?s this error\b/i,
];

export function promptNeedsFocusedCrop(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  if (promptNeedsTextClarityVisual(text)) return true;
  return CODE_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

export function chooseVisualQualityPreset(
  prompt: string,
  options?: { retry?: boolean },
): VisualQualityPreset {
  if (options?.retry) return "aggressive";
  if (promptNeedsFocusedCrop(prompt)) return "text";
  return "general";
}

export function chooseVisualFrameMode(
  prompt: string,
  hasWindowBounds: boolean,
): VisualFrameMode {
  if (!promptNeedsFocusedCrop(prompt)) return "screen";
  if (hasWindowBounds) return "active_window_crop";
  return "center_crop";
}
