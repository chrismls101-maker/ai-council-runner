/**
 * Voice / command-bar intent — send a plan or answer to Glass, Cursor, or Claude.
 */

import type { GlassLastAskResponse } from "./glassAskTypes.ts";
import { lastAskResponseBody } from "./glassAskTypes.ts";
import type { ExtractBuildTarget } from "./extractBuildHandoff.ts";

export interface BuildHandoffIntent {
  target: ExtractBuildTarget;
  sourceText: string;
  /** Prefer machine-audio / extract transcript over last answer. */
  preferTranscript?: boolean;
}

const TARGET_PATTERNS: Array<{ target: ExtractBuildTarget; patterns: RegExp[] }> = [
  {
    target: "cursor",
    patterns: [
      /\b(send|put|paste|copy|open|build|move|drop|ship|push)\b[^.?]{0,48}\bcursor\b/i,
      /\bbuild\s+(that|this|it|the plan)\s+in\s+cursor\b/i,
      /\bsend\s+to\s+cursor\b/i,
      /\bput\s+(that|this|it)\s+in\s+cursor\b/i,
    ],
  },
  {
    target: "claude",
    patterns: [
      /\b(send|put|paste|copy|open|build|move|drop|ship|push)\b[^.?]{0,48}\bclaude\b/i,
      /\bbuild\s+(that|this|it|the plan)\s+in\s+claude\b/i,
      /\bsend\s+to\s+claude\b/i,
      /\bput\s+(that|this|it)\s+in\s+claude\b/i,
    ],
  },
  {
    target: "glass",
    patterns: [
      /\b(send|put|paste|copy|open|build|move|drop|ship|push)\b[^.?]{0,48}\b(glass|iivo)\b/i,
      /\bbuild\s+(that|this|it|the plan)\s+in\s+glass\b/i,
      /\bsend\s+to\s+glass\b/i,
      /\bput\s+(that|this|it)\s+in\s+(the\s+)?command\s+bar\b/i,
    ],
  },
];

const TRANSCRIPT_HINT =
  /\b(heard|listening|transcript|video|podcast|what they said|what you heard|from the video)\b/i;

const REFERENCE_HINT =
  /\b(that|this|it|the plan|the prompt|your answer|last answer|what you (just )?said|the breakdown|breakdown)\b/i;

export function classifyBuildHandoffIntent(text: string): BuildHandoffIntent | null {
  const sourceText = text.trim();
  if (!sourceText) return null;

  for (const { target, patterns } of TARGET_PATTERNS) {
    if (!patterns.some((re) => re.test(sourceText))) continue;
    const hasReference = REFERENCE_HINT.test(sourceText);
    const bareDestination =
      /\b(send|put|paste)\s+(to|in|into)\s+(cursor|claude|glass)\b/i.test(sourceText);
    if (!hasReference && !bareDestination && !TRANSCRIPT_HINT.test(sourceText)) {
      continue;
    }
    return {
      target,
      sourceText,
      preferTranscript: TRANSCRIPT_HINT.test(sourceText),
    };
  }
  return null;
}

export interface ResolveBuildHandoffPromptInput {
  lastAskResponse?: GlassLastAskResponse | null;
  systemTranscript?: string;
  preferTranscript?: boolean;
}

export function formatTranscriptHandoffPrompt(transcript: string): string {
  const trimmed = transcript.trim();
  const body =
    trimmed.length > 6_000
      ? `${trimmed.slice(-6_000)}\n[transcript truncated]`
      : trimmed;
  return `Build from this video/audio transcript:\n\n${body}`;
}

/** Minimum transcript length before handoff-from-audio is allowed. */
export const BUILD_HANDOFF_MIN_TRANSCRIPT_CHARS = 200;

export function resolveBuildHandoffPrompt(
  input: ResolveBuildHandoffPromptInput,
): string | null {
  const fromResponse = lastAskResponseBody(input.lastAskResponse)?.trim();
  if (!input.preferTranscript && fromResponse) return fromResponse;

  const transcript = input.systemTranscript?.trim();
  if (
    transcript &&
    transcript.length >= BUILD_HANDOFF_MIN_TRANSCRIPT_CHARS
  ) {
    return formatTranscriptHandoffPrompt(transcript);
  }

  return fromResponse || null;
}

export const BUILD_HANDOFF_MISSING_PROMPT_SPEECH =
  "I don't have a plan or prompt to send yet — ask me to draft one first, or listen to more of the video.";

export function buildHandoffSuccessSpeech(
  target: ExtractBuildTarget,
  pasted: boolean,
): string {
  switch (target) {
    case "glass":
      return pasted
        ? "I've put it in the command bar — press Enter when you're ready."
        : "The prompt is in the command bar — press Enter to send it.";
    case "cursor":
      return pasted
        ? "It's in Cursor Composer — press Enter there when you're ready."
        : "The prompt is copied — open Cursor Composer and paste it.";
    case "claude":
      return pasted
        ? "It's in Claude — press Enter when you're ready."
        : "The prompt is copied — paste it in Claude.";
  }
}
