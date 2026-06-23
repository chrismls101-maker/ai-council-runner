/**
 * Glass IDE — Aletheia advisory layer (pure policy).
 * Subtle chip + rare feed lines; gates chrome auto-expand when user is in flow.
 */

import type { IdeChromeSignal } from "./glassIdeChromeOrchestrator.ts";

export const GLASS_IDE_FLOW_QUIET_MS = 8_000;
/** Brief delay before auto-expand when editor was active recently. */
export const GLASS_IDE_ADVISORY_DEFER_EXPAND_MS = 3_000;
/** Fix rounds before a spoken stuck hint (loop iteration). */
export const GLASS_IDE_STUCK_FIX_ROUNDS = 2;

export type GlassIdeAletheiaFeedTone = "neutral" | "warn" | "ok";

export interface GlassIdeAletheiaFeedLine {
  id: string;
  label: string;
  detail?: string;
  tone: GlassIdeAletheiaFeedTone;
}

export interface GlassIdeAletheiaSnapshot {
  chip: string | null;
  feedLine: GlassIdeAletheiaFeedLine | null;
  spokenText: string | null;
  spokenNonce: number;
}

export function emptyGlassIdeAletheiaSnapshot(): GlassIdeAletheiaSnapshot {
  return {
    chip: null,
    feedLine: null,
    spokenText: null,
    spokenNonce: 0,
  };
}

export type IdeAletheiaRunPhase = "idle" | "running" | "failed" | "success";

const AUTO_EXPAND_SIGNALS = new Set<IdeChromeSignal["kind"]>([
  "qa-shell-check-start",
  "pty-error",
  "dev-server-detected",
  "terminal-run",
  "agent-tool-start",
]);

export function isAutoExpandChromeSignal(signal: IdeChromeSignal): boolean {
  return AUTO_EXPAND_SIGNALS.has(signal.kind);
}

export function deriveIdeInFlow(now: number, editorUpdatedAt: number): boolean {
  return editorUpdatedAt > 0 && now - editorUpdatedAt < GLASS_IDE_FLOW_QUIET_MS;
}

export function gateChromeExpandSignal(input: {
  signal: IdeChromeSignal;
  now: number;
  editorUpdatedAt: number;
  terminalInteractionAt: number;
}): { allow: boolean; deferMs: number } {
  if (!isAutoExpandChromeSignal(input.signal)) {
    return { allow: true, deferMs: 0 };
  }
  if (deriveIdeInFlow(input.now, input.editorUpdatedAt)) {
    return { allow: false, deferMs: 0 };
  }
  if (
    input.terminalInteractionAt > 0
    && input.now - input.terminalInteractionAt < 2_000
  ) {
    return { allow: true, deferMs: 0 };
  }
  if (
    input.editorUpdatedAt > 0
    && input.now - input.editorUpdatedAt < GLASS_IDE_FLOW_QUIET_MS * 2
  ) {
    return { allow: true, deferMs: GLASS_IDE_ADVISORY_DEFER_EXPAND_MS };
  }
  return { allow: true, deferMs: 0 };
}

export function normalizeErrorSignature(hint: string): string {
  return hint.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 160);
}

export interface AletheiaAdvisoryComputeInput {
  now: number;
  editorUpdatedAt: number;
  phase: IdeAletheiaRunPhase;
  prevPhase: IdeAletheiaRunPhase;
  agentRunning: boolean;
  hasFailure: boolean;
  loopIteration: number;
  errorHint: string | null;
  firstErrorHintShown: boolean;
  lastSpokenErrorSignature: string | null;
  feedLineCounter: number;
  spokenNonce: number;
}

export interface AletheiaAdvisoryComputeResult {
  snapshot: GlassIdeAletheiaSnapshot;
  nextPhase: IdeAletheiaRunPhase;
  feedLineCounter: number;
  spokenNonce: number;
  lastSpokenErrorSignature: string | null;
  markFirstErrorHintShown: boolean;
  errorSignature: string | null;
}

export function computeAletheiaAdvisory(
  input: AletheiaAdvisoryComputeInput,
): AletheiaAdvisoryComputeResult {
  const inFlow = deriveIdeInFlow(input.now, input.editorUpdatedAt);
  const errorSignature = input.errorHint
    ? normalizeErrorSignature(input.errorHint)
    : null;

  let chip: string | null = null;
  if (input.hasFailure) {
    chip = "Aletheia · Error visible";
  } else if (input.agentRunning && inFlow) {
    chip = "Aletheia · In flow";
  }

  let feedLine: GlassIdeAletheiaFeedLine | null = null;
  let feedLineCounter = input.feedLineCounter;
  const phaseChanged = input.phase !== input.prevPhase;

  if (phaseChanged && input.phase === "failed") {
    feedLineCounter += 1;
    feedLine = {
      id: `aletheia-feed-${feedLineCounter}`,
      tone: "warn",
      label: "Build or checks failed — see terminal",
      detail: input.errorHint?.slice(0, 120) || undefined,
    };
  } else if (phaseChanged && input.phase === "success") {
    feedLineCounter += 1;
    feedLine = {
      id: `aletheia-feed-${feedLineCounter}`,
      tone: "ok",
      label: "Clean run — terminal will tuck away if you leave it alone",
    };
  }

  let spokenText: string | null = null;
  let spokenNonce = input.spokenNonce;
  let lastSpokenErrorSignature = input.lastSpokenErrorSignature;
  let markFirstErrorHintShown = false;

  if (input.hasFailure && errorSignature) {
    const alreadySpokeThis = lastSpokenErrorSignature === errorSignature;
    if (!input.firstErrorHintShown) {
      spokenText = "There's an error in the terminal — take a look when you're ready.";
      spokenNonce += 1;
      lastSpokenErrorSignature = errorSignature;
      markFirstErrorHintShown = true;
    } else if (
      !alreadySpokeThis
      && input.loopIteration >= GLASS_IDE_STUCK_FIX_ROUNDS
    ) {
      spokenText = "Still on the same error — try Fix all or adjust your prompt.";
      spokenNonce += 1;
      lastSpokenErrorSignature = errorSignature;
    }
  }

  return {
    snapshot: {
      chip,
      feedLine,
      spokenText,
      spokenNonce,
    },
    nextPhase: input.phase,
    feedLineCounter,
    spokenNonce,
    lastSpokenErrorSignature,
    markFirstErrorHintShown,
    errorSignature,
  };
}

export function deriveAletheiaRunPhase(input: {
  agentRunning: boolean;
  agentFailed: boolean;
  qaHasFail: boolean;
  verifyFailed: boolean;
  agentDone: boolean;
  qaRunning: boolean;
}): IdeAletheiaRunPhase {
  if (input.agentRunning || input.qaRunning) return "running";
  if (input.agentFailed || input.qaHasFail || input.verifyFailed) return "failed";
  if (input.agentDone) return "success";
  return "idle";
}
