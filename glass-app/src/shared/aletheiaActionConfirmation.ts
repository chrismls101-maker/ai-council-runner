/**
 * Aletheia action confirmation surface (B2.2).
 *
 * Formats orchestrator pending confirmations and resolves voice approve/reject/modify.
 */

import type { AletheiaActionPipelineSnapshot } from "./aletheiaExecution.ts";

export interface ActionConfirmationCardView {
  intentId: string;
  runLine: string;
  targetLine: string;
  reasonLine: string;
  commandPreview?: string;
  scopeDeclaration?: string;
  narration: string;
}

const CONFIRM_YES_PATTERNS: RegExp[] = [
  /^(yes|yeah|yep|yup|sure|ok|okay|approve|go ahead|do it|run it|confirm)\b/i,
  /^(yes|yeah|yep|yup|sure|ok|okay|approve|go ahead|do it|run it|confirm)[.!?,]*$/i,
  /\b(yes please|go for it|looks good|approved)\b/i,
];

const CONFIRM_NO_PATTERNS: RegExp[] = [
  /^(no|nope|nah|reject|cancel|stop|skip|never mind|nevermind|don'?t)\b/i,
  /^(no|nope|nah|reject|cancel|stop|skip|never mind|nevermind|don'?t)[.!?,]*$/i,
  /\b(no thanks|not now|don'?t run)\b/i,
];

const MODIFY_PREFIX =
  /\b(change it to|instead run|run .+ instead|use .+ instead|modify to|make it)\b/i;

export type VoiceActionConfirmationResolution =
  | { decision: "approve"; matched: string }
  | { decision: "reject"; matched: string }
  | { decision: "modify"; modifier: string; matched: string };

export function formatActionConfirmationCard(
  pending: NonNullable<AletheiaActionPipelineSnapshot["pendingConfirmation"]>,
): ActionConfirmationCardView {
  return {
    intentId: pending.intentId,
    runLine: pending.summary,
    targetLine: pending.targetDescription,
    reasonLine: pending.rationale,
    commandPreview: pending.commandPreview,
    scopeDeclaration: pending.scopeDeclaration,
    narration: pending.narration,
  };
}

export function resolveVoiceActionConfirmation(
  text: string,
  pipeline: AletheiaActionPipelineSnapshot | null | undefined,
): VoiceActionConfirmationResolution | null {
  if (!pipeline?.pendingConfirmation) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (MODIFY_PREFIX.test(trimmed)) {
    return { decision: "modify", modifier: trimmed, matched: trimmed };
  }

  for (const re of CONFIRM_NO_PATTERNS) {
    if (re.test(trimmed)) {
      return { decision: "reject", matched: trimmed };
    }
  }

  for (const re of CONFIRM_YES_PATTERNS) {
    if (re.test(trimmed)) {
      return { decision: "approve", matched: trimmed };
    }
  }

  return null;
}

export function actionResultAckSpeech(
  ok: boolean,
  message: string,
): string {
  if (ok) {
    return message.startsWith("Done")
      ? message
      : `Done. Here is what happened: ${message}`;
  }
  return `I couldn't complete that: ${message}`;
}
