/**
 * Session Copilot — Diagnostic-mode stuck/error pattern detection.
 *
 * Deterministic signals only. Diagnostic mode uses this to decide whether to
 * OFFER a diagnosis ("Want me to diagnose what's going wrong?"). It never
 * auto-diagnoses — the user must approve.
 *
 * Pure — no electron / fs.
 */

import type { GlassSessionEvent } from "./sessionTypes.ts";
import { isDuplicateText } from "./sessionIntelligence.ts";

const ERROR_CUES = [
  "error",
  "failed",
  "failure",
  "exception",
  "cannot",
  "can't",
  "not working",
  "doesn't work",
  "broken",
  "undefined",
  "null pointer",
  "stack trace",
  "traceback",
  "crash",
  "stuck",
  "still not",
  "again",
];

export interface DiagnosticSignalInput {
  /** Recent session events (transcript_note / screen_capture / app_context / iivo_*). */
  events: GlassSessionEvent[];
  recentCommands?: string[];
  /** Whether the most recent visual asks failed. */
  visualAskFailureCount?: number;
}

export interface DiagnosticSignal {
  stuck: boolean;
  reason?: string;
  errorCount: number;
  repeatedPromptCount: number;
  visualAskFailureCount: number;
}

function textOf(event: GlassSessionEvent): string {
  return [event.title, event.text].filter(Boolean).join(". ");
}

function isErrorLike(text: string): boolean {
  const lower = text.toLowerCase();
  return ERROR_CUES.some((cue) => lower.includes(cue));
}

/** Count user prompts that repeat around the same issue (near-duplicate text). */
function countRepeatedPrompts(commands: string[]): number {
  let maxCluster = 0;
  for (let i = 0; i < commands.length; i += 1) {
    let cluster = 1;
    for (let j = i + 1; j < commands.length; j += 1) {
      if (isDuplicateText(commands[i], commands[j])) cluster += 1;
    }
    maxCluster = Math.max(maxCluster, cluster);
  }
  return maxCluster;
}

/**
 * Detect whether the user appears stuck. Triggers when:
 *   - 2+ error-like signals (screen text / transcript), OR
 *   - 2+ repeated visual ask failures, OR
 *   - the same prompt repeated 2+ times (asking around one issue).
 */
export function detectStuckSignal(input: DiagnosticSignalInput): DiagnosticSignal {
  const errorEvents = input.events.filter((e) => isErrorLike(textOf(e)));
  const errorCount = errorEvents.length;
  const repeatedPromptCount = countRepeatedPrompts(input.recentCommands ?? []);
  const visualAskFailureCount = input.visualAskFailureCount ?? 0;

  let stuck = false;
  let reason: string | undefined;

  if (errorCount >= 2) {
    stuck = true;
    const sample = errorEvents[errorEvents.length - 1];
    reason = `Repeated error signals detected${sample ? `: “${sample.title}”` : "."}`;
  } else if (visualAskFailureCount >= 2) {
    stuck = true;
    reason = "Repeated visual ask failures on the same screen.";
  } else if (repeatedPromptCount >= 2) {
    stuck = true;
    reason = "You've asked about the same thing a few times.";
  }

  return { stuck, reason, errorCount, repeatedPromptCount, visualAskFailureCount };
}
