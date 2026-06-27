import { randomUUID } from "node:crypto";

export type ActionKind = "shell" | "file-write" | "file-apply" | "keystroke" | "app-control" | "research" | "delegated";

export type PipelineStage =
  | "intent"
  | "planning"
  | "awaiting-confirmation"
  | "executing"
  | "verifying"
  | "complete"
  | "failed"
  | "rolled-back";

export interface ActionScope {
  description: string;
  allowedPrefixes?: string[];
  allowedPaths?: string[];
  targetApp?: string;
}

export interface ActionIntent {
  id: string;
  sessionId: string;
  kind: ActionKind;
  summary: string;
  rationale: string;
  scope: ActionScope;
  payload: Record<string, unknown>;
  requestedAt: number;
  /** Links back to overlay feed / Glass action id for UI feedback. */
  glassActionId?: string;
}

export interface ActionConfirmation {
  intentId: string;
  confirmedAt: number;
  confirmedBy: "user-voice" | "user-tap" | "founder-auto";
  modifier?: string;
}

export interface ActionResult {
  intentId: string;
  ok: boolean;
  output?: string;
  errorMessage?: string;
  executedAt: number;
  durationMs: number;
  rollbackAvailable: boolean;
}

export interface PipelineState {
  intentId: string;
  stage: PipelineStage;
  narration: string;
  updatedAt: number;
}

/** Durable ledger row — written by AletheiaExecutionLedger (P0.1). */
export interface ActionLedgerEntry {
  id: string;
  intentId: string;
  sessionId: string | null;
  stage: PipelineStage;
  kind: ActionKind;
  summary: string;
  narration: string;
  payloadJson: string | null;
  ok: boolean | null;
  errorMessage: string | null;
  createdAt: number;
}

export interface OrchestratorOptions {
  autoConfirm?: boolean;
  confirmTimeoutMs?: number;
}

export interface AletheiaActionPipelineSnapshot {
  pendingConfirmation?: {
    intentId: string;
    kind: ActionKind;
    summary: string;
    rationale: string;
    scopeDescription: string;
    narration: string;
    requestedAt: number;
    glassActionId?: string;
  };
  active?: PipelineState;
  lastResult?: {
    intentId: string;
    stage: PipelineStage;
    narration: string;
    ok: boolean;
    message: string;
    updatedAt: number;
    glassActionId?: string;
  };
}

export function makeIntentId(): string {
  return randomUUID();
}

export function makeLedgerEntryId(): string {
  return randomUUID();
}

export function pipelineState(
  intentId: string,
  stage: PipelineStage,
  narration: string,
  updatedAt = Date.now(),
): PipelineState {
  return { intentId, stage, narration, updatedAt };
}

export function narrationForStage(intent: ActionIntent, stage: PipelineStage, result?: ActionResult): string {
  switch (stage) {
    case "intent":
      return `Aletheia received your request: ${intent.summary}.`;
    case "planning":
      return `Planning: ${intent.rationale} Scope: ${intent.scope.description}.`;
    case "awaiting-confirmation":
      return `Ready for your approval — ${intent.summary}. ${intent.scope.description}.`;
    case "executing":
      return `Executing now: ${intent.summary}.`;
    case "verifying":
      return `Verifying result of: ${intent.summary}.`;
    case "complete":
      return result?.ok
        ? `Done. ${result.output ?? intent.summary}`
        : `Completed with issues: ${result?.errorMessage ?? "unknown error"}`;
    case "failed":
      return `Could not complete: ${result?.errorMessage ?? intent.summary}.`;
    case "rolled-back":
      return `Rolled back changes for: ${intent.summary}.`;
    default:
      return intent.summary;
  }
}

/** Build intent from Glass overlay write-file command. */
export function intentFromWriteFile(input: {
  path: string;
  content: string;
  id: string;
  sessionId: string;
  rationale?: string;
}): ActionIntent {
  return {
    id: makeIntentId(),
    sessionId: input.sessionId,
    kind: "file-write",
    summary: `Write file ${input.path}`,
    rationale: input.rationale ?? "User approved writing Glass output to disk.",
    scope: {
      description: `Single file write to ${input.path}`,
      allowedPaths: [input.path],
    },
    payload: { path: input.path, content: input.content },
    requestedAt: Date.now(),
    glassActionId: input.id,
  };
}

/** Build intent from Glass overlay inject-keystrokes command. */
export function intentFromKeystrokes(input: {
  text: string;
  id: string;
  sessionId: string;
  targetApp?: string;
  rationale?: string;
}): ActionIntent {
  const preview =
    input.text.length > 60 ? `${input.text.slice(0, 60)}… (${input.text.length} chars)` : input.text;
  return {
    id: makeIntentId(),
    sessionId: input.sessionId,
    kind: "keystroke",
    summary: `Type text into ${input.targetApp ?? "active app"}: "${preview}"`,
    rationale: input.rationale ?? "User approved typing Glass output into the front app.",
    scope: {
      description: input.targetApp
        ? `Keystroke injection into ${input.targetApp}`
        : "Keystroke injection into active app",
      targetApp: input.targetApp,
    },
    payload: {
      text: input.text,
      targetApp: input.targetApp,
      maxChars: 50_000,
    },
    requestedAt: Date.now(),
    glassActionId: input.id,
  };
}

export function confirmationFromUserTap(intentId: string): ActionConfirmation {
  return {
    intentId,
    confirmedAt: Date.now(),
    confirmedBy: "user-tap",
  };
}

