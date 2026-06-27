/**
 * Aletheia activation policy (B1.2 — Sensing Layer).
 *
 * Presence-first companion activation: Aletheia waits for the user to lead.
 * Ambient synthesis enriches calls only after relevance is established — never
 * as the default opener.
 */

import type { CompanionRoute } from "./companionRetarget.ts";
import { shouldCaptureScreenForGlassAsk } from "./glassVisualIntent.ts";

export type AletheiaActivationPhase = "presence" | "engaged";

export type ActivationTurnClassification =
  | "work_command"
  | "conversation"
  | "general";

export interface AletheiaActivationState {
  phase: AletheiaActivationPhase;
  activatedAt: number;
  /** Completed user turns in the current companion session. */
  userTurnCount: number;
  awaitingUserLead: boolean;
  lastClassification?: ActivationTurnClassification;
}

export interface ActivationContextGateInput {
  activation: AletheiaActivationState | null | undefined;
  companionModeActive: boolean;
  companionRoute?: CompanionRoute;
  prompt: string;
}

export interface ActivationContextGateResult {
  suppressAmbientSynthesis: boolean;
  requireConfirmObservedContext: boolean;
  companionActivationHint?: string;
  classification: ActivationTurnClassification;
}

export interface ActivationTurnScores {
  work: number;
  conversation: number;
  general: number;
}

const WORK_COMMAND_PATTERNS: RegExp[] = [
  /\b(fix|debug|resolve|handle|update|change|edit|write|create|delete|remove|add|implement|refactor|run|build|deploy|click|open|close|save|review|check|look at|find|search|summarize|explain this|what is this|what's this|help me with)\b/i,
  /\b(this file|this error|the error|that button|on screen|on my screen|in cursor|in vscode|in figma|in terminal|the terminal|my clipboard)\b/i,
];

const OFF_TOPIC_PATTERNS: RegExp[] = [
  /\b(weather|sports|politics|recipe|movie|song|celebrity|stock price|bitcoin|crypto)\b/i,
  /\b(tell me a joke|who are you|what are you|how old are you)\b/i,
];

const GENERAL_EDUCATION_PATTERNS: RegExp[] = [
  /^how (?:does|do|can|would) .+ work/i,
  /^what is (?:a|an|the) /i,
  /^explain (?:the concept of|what) /i,
  /\b(difference between|pros and cons|history of|meaning of|eli5|explain like i)/i,
];

/** Work-context questions — classify before generic conversation. */
const WORK_CONTEXT_STRONG_PATTERNS: RegExp[] = [
  /\b(how do i|how can i|why is this|why does this|what does this|what is wrong with|where is the)\b/i,
  /\b(in this file|in my code|this function|this method|this class|this component|this module|this error|this bug|this test|this build|my project|my repo|on screen|the screen)\b/i,
  /\b(stack trace|build failed|compiler error|lint error|type error)\b/i,
];

const WORK_ARTIFACT_TERMS =
  /\b(typescript|javascript|python|rust|swift|react|npm|git|cursor|vscode|terminal)\b/i;

const WORK_POINTER_TERMS =
  /\b(this|my|here|current|failing|on screen|in this|in my|in the file|in cursor|in vscode|in terminal|in react|the error|the bug|the test|the build|the code|the project|the repo)\b/i;

function isWorkContextQuestion(text: string): boolean {
  if (!looksLikeQuestion(text)) return false;
  if (WORK_CONTEXT_STRONG_PATTERNS.some((re) => re.test(text))) return true;
  if (WORK_ARTIFACT_TERMS.test(text) && WORK_POINTER_TERMS.test(text)) return true;
  return false;
}

function looksLikeQuestion(text: string): boolean {
  return /\?\s*$/.test(text) || /\b(what|why|how|when|where|who|can you|could you)\b/i.test(text);
}

export const COMPANION_ACTIVATION_CONFIRM_HINT =
  "Activation policy: the user just activated companion mode with a work-oriented request. Briefly confirm what you observe on screen, then proceed. Do not open with an unrelated screen summary or preamble.";

export const COMPANION_ACTIVATION_NO_PREAMBLE_HINT =
  "Activation policy: the user just activated companion mode. Answer their question directly. Do not summarize the screen or inject ambient context they did not ask for.";

export function initialAletheiaActivationState(now = Date.now()): AletheiaActivationState {
  return {
    phase: "presence",
    activatedAt: now,
    userTurnCount: 0,
    awaitingUserLead: true,
  };
}

export function scoreActivationTurn(text: string): ActivationTurnScores {
  const trimmed = text.trim();
  const scores: ActivationTurnScores = { work: 0, conversation: 0, general: 0 };
  if (!trimmed) return scores;

  if (shouldCaptureScreenForGlassAsk(trimmed)) scores.work += 4;
  if (WORK_COMMAND_PATTERNS.some((re) => re.test(trimmed))) scores.work += 3;
  if (isWorkContextQuestion(trimmed)) scores.work += 4;
  if (OFF_TOPIC_PATTERNS.some((re) => re.test(trimmed))) scores.general += 4;

  if (
    GENERAL_EDUCATION_PATTERNS.some((re) => re.test(trimmed))
    && !WORK_POINTER_TERMS.test(trimmed)
  ) {
    scores.conversation += 3;
    scores.work = Math.max(0, scores.work - 2);
  }

  if (looksLikeQuestion(trimmed)) scores.conversation += 2;
  if (/\b(aletheia|hey glass|iivo)\b/i.test(trimmed)) scores.conversation += 1;

  if (!looksLikeQuestion(trimmed) && scores.work === 0 && trimmed.length < 24) {
    scores.general += 1;
  }

  return scores;
}

export function classifyActivationTurn(text: string): ActivationTurnClassification {
  const trimmed = text.trim();
  if (!trimmed) return "general";

  const scores = scoreActivationTurn(trimmed);
  const top = Math.max(scores.work, scores.conversation, scores.general);

  if (top === 0) return "general";
  if (scores.work === top && scores.work >= 2) return "work_command";
  if (scores.general === top && scores.general >= 2) return "general";
  if (scores.conversation === top && scores.conversation >= 2) return "conversation";
  if (scores.work > 0) return "work_command";
  if (scores.conversation > 0) return "conversation";
  return "general";
}

function isEstablishedCompanionRoute(route: CompanionRoute | undefined): boolean {
  return (
    route === "direct_follow_up"
    || route === "retarget"
    || route === "script_continue"
    || route === "barge_in"
  );
}

export function resolveActivationContextGate(
  input: ActivationContextGateInput,
): ActivationContextGateResult {
  const classification = classifyActivationTurn(input.prompt);

  if (!input.companionModeActive || !input.activation) {
    return {
      suppressAmbientSynthesis: false,
      requireConfirmObservedContext: false,
      classification,
    };
  }

  if (isEstablishedCompanionRoute(input.companionRoute)) {
    return {
      suppressAmbientSynthesis: false,
      requireConfirmObservedContext: false,
      classification,
    };
  }

  if (input.activation.phase === "engaged" || input.activation.userTurnCount > 0) {
    return {
      suppressAmbientSynthesis: false,
      requireConfirmObservedContext: false,
      classification,
    };
  }

  if (classification === "work_command") {
    return {
      suppressAmbientSynthesis: false,
      requireConfirmObservedContext: true,
      companionActivationHint: COMPANION_ACTIVATION_CONFIRM_HINT,
      classification,
    };
  }

  return {
    suppressAmbientSynthesis: true,
    requireConfirmObservedContext: false,
    companionActivationHint: COMPANION_ACTIVATION_NO_PREAMBLE_HINT,
    classification,
  };
}

export function advanceAletheiaActivationAfterTurn(
  current: AletheiaActivationState,
  classification: ActivationTurnClassification,
  now = Date.now(),
): AletheiaActivationState {
  return {
    ...current,
    phase: "engaged",
    userTurnCount: current.userTurnCount + 1,
    awaitingUserLead: false,
    lastClassification: classification,
    activatedAt: current.activatedAt || now,
  };
}

export function activationPhaseLabel(phase: AletheiaActivationPhase): string {
  return phase === "presence" ? "Presence — waiting" : "Engaged";
}
