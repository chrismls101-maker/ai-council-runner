/**
 * Classify natural-language requests for the computer operator loop.
 */

import { planFromNaturalLanguage } from "./aletheiaConversationPlanner.ts";

export interface ComputerOperatorIntent {
  goal: string;
  matched: string;
}

const USE_COMPUTER_PATTERNS: RegExp[] = [
  /\b(?:use|on|control|operate)\s+my\s+computer\b/i,
  /\b(?:use|take)\s+the\s+computer\b/i,
  /\bcomputer\s*,?\s*(?:please\s+)?(.+)/i,
];

const TASK_PATTERNS: RegExp[] = [
  /\b(?:open|go to|switch to)\s+.+\s+(?:and|,)\s+(?:summarize|summary|read|inspect|check|find|tell me)/i,
  /\b(?:summarize|read|inspect|check)\s+(?:the\s+)?(?:unread|latest|newest)\b/i,
];

/** Detect conversation requests that should start the computer operator. */
export function classifyComputerOperatorIntent(text: string): ComputerOperatorIntent | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const pattern of USE_COMPUTER_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const tail = match[1]?.trim();
      const goal = tail && tail.length > 8 ? tail : trimmed;
      return { goal, matched: pattern.source };
    }
  }

  for (const pattern of TASK_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { goal: trimmed, matched: pattern.source };
    }
  }

  const plan = planFromNaturalLanguage(trimmed);
  if (
    plan.targetApps.length > 0
    && /\b(open|go to|summarize|unread|thread|navigate|click|find)\b/i.test(trimmed)
  ) {
    return { goal: trimmed, matched: "grounded-task" };
  }

  return null;
}

export function computerOperatorIntroSpeech(
  goal: string,
  autoRun: boolean,
  surface: "conversation" | "dashboard" = "conversation",
): string {
  const preview = goal.length > 96 ? `${goal.slice(0, 96)}…` : goal;
  if (autoRun) {
    return `I'll work on your screen: ${preview}. I'll stay within the granted scope and report back when done.`;
  }
  if (surface === "conversation") {
    return `I can do that on your screen — here's what I'd do and what I need your OK for:`;
  }
  return `I planned a computer task: ${preview}. Review the scope below and grant the session when you're ready.`;
}
