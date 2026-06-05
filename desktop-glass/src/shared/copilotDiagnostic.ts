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
  "still failing",
  "same issue",
  "no signal",
  "no audio",
  "permission denied",
  "denied",
];

const CONTRADICTION_CUES = [
  "but earlier",
  "that contradicts",
  "doesn't match",
  "does not match",
  "not working",
  "still failing",
  "same issue",
  "i already did that",
  "i already tried that",
  "that doesn't make sense",
  "conflicting",
];

const SETUP_LOOP_CUES = [
  "permission",
  "microphone",
  "screen recording",
  "blackhole",
  "virtual audio",
  "device",
  "routing",
  "restarted",
  "toggled",
  "selected",
  "still failing",
  "still not working",
  "no signal",
  "no audio",
];

export type DiagnosticCategory =
  | "repeated_error"
  | "repeated_prompt"
  | "visual_ask_failure"
  | "contradiction"
  | "setup_loop"
  | "low_progress";

export interface DiagnosticSignalInput {
  /** Recent session events (transcript_note / screen_capture / app_context / iivo_*). */
  events: GlassSessionEvent[];
  recentCommands?: string[];
  /** Whether the most recent visual asks failed. */
  visualAskFailureCount?: number;
  /** Active app name for low-progress detection. */
  sourceApp?: string;
  sourceTitle?: string;
}

export interface DiagnosticSignal {
  stuck: boolean;
  reason?: string;
  category?: DiagnosticCategory;
  errorCount: number;
  repeatedPromptCount: number;
  visualAskFailureCount: number;
  contradictionCount: number;
  setupLoopSignals: number;
}

function textOf(event: GlassSessionEvent): string {
  return [event.title, event.text, event.sourceApp, event.sourceTitle].filter(Boolean).join(". ");
}

function corpusText(input: DiagnosticSignalInput): string {
  return [
    ...input.events.map(textOf),
    ...(input.recentCommands ?? []),
    input.sourceApp ?? "",
    input.sourceTitle ?? "",
  ]
    .join(" \n ")
    .toLowerCase();
}

function isErrorLike(text: string): boolean {
  const lower = text.toLowerCase();
  return ERROR_CUES.some((cue) => lower.includes(cue));
}

function countCues(text: string, cues: string[]): number {
  const lower = text.toLowerCase();
  let n = 0;
  for (const cue of cues) {
    if (lower.includes(cue)) n += 1;
  }
  return n;
}

/** Count user prompts that repeat around the same issue (near-duplicate + prompt-like). */
function isPromptLike(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    isErrorLike(lower) ||
    lower.includes("?") ||
    /^(why|how|what|where|when|help|can you|could you|is|are)\b/.test(lower)
  );
}

function countRepeatedPrompts(commands: string[]): number {
  const promptLike = commands.filter((c) => isPromptLike(c));
  if (promptLike.length < 2) return 0;
  let maxCluster = 0;
  for (let i = 0; i < promptLike.length; i += 1) {
    let cluster = 1;
    for (let j = i + 1; j < promptLike.length; j += 1) {
      if (isDuplicateText(promptLike[i], promptLike[j])) cluster += 1;
    }
    maxCluster = Math.max(maxCluster, cluster);
  }
  return maxCluster;
}

function detectSetupLoop(corpus: string, errorEvents: GlassSessionEvent[]): boolean {
  const setupHits = countCues(corpus, SETUP_LOOP_CUES);
  if (setupHits < 2) return false;
  return errorEvents.length >= 1 || /still (not|failing|broken|denied)/i.test(corpus);
}

function detectLowProgress(input: DiagnosticSignalInput, errorEvents: GlassSessionEvent[]): boolean {
  if (errorEvents.length < 2) return false;
  const app = (input.sourceApp ?? "").toLowerCase();
  if (!app) return false;
  const sameAppErrors = errorEvents.filter((e) => (e.sourceApp ?? input.sourceApp ?? "").toLowerCase().includes(app) || isErrorLike(textOf(e)));
  return sameAppErrors.length >= 2;
}

function detectContradiction(corpus: string): boolean {
  return countCues(corpus, CONTRADICTION_CUES) >= 1 && /but|doesn't|does not|contradict|conflict/i.test(corpus);
}

/**
 * Detect whether the user appears stuck. Triggers when:
 *   - 2+ error-like signals (screen text / transcript), OR
 *   - 2+ repeated visual ask failures, OR
 *   - the same error-ish prompt repeated 2+ times, OR
 *   - contradiction / setup loop / low-progress patterns.
 */
export function detectStuckSignal(input: DiagnosticSignalInput): DiagnosticSignal {
  const errorEvents = input.events.filter((e) => isErrorLike(textOf(e)));
  const errorCount = errorEvents.length;
  const repeatedPromptCount = countRepeatedPrompts(input.recentCommands ?? []);
  const visualAskFailureCount = input.visualAskFailureCount ?? 0;
  const corpus = corpusText(input);
  const contradictionCount = countCues(corpus, CONTRADICTION_CUES);
  const setupLoopSignals = countCues(corpus, SETUP_LOOP_CUES);

  let stuck = false;
  let reason: string | undefined;
  let category: DiagnosticCategory | undefined;

  if (visualAskFailureCount >= 2) {
    stuck = true;
    category = "visual_ask_failure";
    reason = "Repeated visual ask failures on the same screen.";
  } else if (detectSetupLoop(corpus, errorEvents)) {
    stuck = true;
    category = "setup_loop";
    reason = "Setup or permissions may be looping — toggled or restarted but still failing.";
  } else if (detectContradiction(corpus)) {
    stuck = true;
    category = "contradiction";
    reason = "Conflicting or contradictory signals in what you're working through.";
  } else if (detectLowProgress(input, errorEvents)) {
    stuck = true;
    category = "low_progress";
    reason = "Same app/window with repeated errors and little progress.";
  } else if (errorCount >= 2) {
    stuck = true;
    category = "repeated_error";
    const sample = errorEvents[errorEvents.length - 1];
    reason = `Repeated error signals detected${sample ? `: “${sample.title}”` : "."}`;
  } else if (repeatedPromptCount >= 2) {
    stuck = true;
    category = "repeated_prompt";
    reason = "You've asked about the same issue a few times.";
  }

  return {
    stuck,
    reason,
    category,
    errorCount,
    repeatedPromptCount,
    visualAskFailureCount,
    contradictionCount,
    setupLoopSignals,
  };
}

/** Normal workflow chatter should not trigger diagnostic offers. */
export function isLikelyDiagnosticSpam(input: DiagnosticSignalInput): boolean {
  const corpus = corpusText(input);
  if (isErrorLike(corpus) || detectContradiction(corpus)) return false;
  const neutral = /weather|coffee|lunch|weekend|nice day/i.test(corpus);
  return neutral && !isErrorLike(corpus);
}
