/**
 * Glass Companion — route detection for multi-turn guidance (Phase 4a).
 *
 * Pure — no Electron / DOM.
 */

import { shouldCaptureScreenForGlassAsk } from "./glassVisualIntent.ts";
import {
  isCompanionMemoryValid,
  type CompanionMemoryContext,
  type CompanionSessionMemory,
} from "./companionSessionMemory.ts";

export type CompanionRoute =
  | "full_visual_ask"
  | "retarget"
  | "direct_follow_up"
  | "script_continue";

export const COMPANION_RETARGET_PATTERNS: RegExp[] = [
  /\bthat one\b/i,
  /\bthis one\b/i,
  /\bthe other one\b/i,
  /\bthe other\b/i,
  /\bnot that\b/i,
  /\bno[,.]?\s*(?:not|that's wrong|that is wrong)\b/i,
  /\binstead\b/i,
  /\bthe one below\b/i,
  /\bthe one above\b/i,
  /\bthe button below\b/i,
  /\bthe line below\b/i,
  /\bnext one\b/i,
  /\bwrong one\b/i,
  /\bnot the (?:first|second|top|bottom)\b/i,
];

export const COMPANION_SCRIPT_CONTINUE_PATTERNS: RegExp[] = [
  /^(?:okay|ok|yes|yep|sure|go on|continue|next|keep going|got it)\.?$/i,
  /^(?:what'?s next|and then)\??$/i,
];

export function looksLikeRetargetCorrection(transcript: string): boolean {
  const text = transcript.trim();
  if (!text) return false;
  return COMPANION_RETARGET_PATTERNS.some((re) => re.test(text));
}

export function looksLikeScriptContinue(transcript: string): boolean {
  const text = transcript.trim();
  if (!text) return false;
  return COMPANION_SCRIPT_CONTINUE_PATTERNS.some((re) => re.test(text));
}

/**
 * Decide how a Companion utterance should be handled given session memory.
 */
export function resolveCompanionRoute(
  transcript: string,
  memory: CompanionSessionMemory | null | undefined,
  ctx: CompanionMemoryContext = {},
): CompanionRoute {
  const text = transcript.trim();
  if (!text) return "direct_follow_up";

  const memoryValid = isCompanionMemoryValid(memory, ctx);

  if (memoryValid && looksLikeScriptContinue(text)) {
    return "script_continue";
  }

  if (memoryValid && looksLikeRetargetCorrection(text)) {
    return "retarget";
  }

  if (shouldCaptureScreenForGlassAsk(text)) {
    return "full_visual_ask";
  }

  if (memoryValid) {
    return "direct_follow_up";
  }

  return "full_visual_ask";
}

export function companionRouteLabel(route: CompanionRoute): string {
  switch (route) {
    case "retarget":
      return "Retarget";
    case "direct_follow_up":
      return "Follow-up";
    case "script_continue":
      return "Continue";
    case "full_visual_ask":
    default:
      return "Screen ask";
  }
}
