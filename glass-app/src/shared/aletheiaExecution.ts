import { randomUUID } from "node:crypto";
import type { AletheiaAdviceKind } from "./aletheiaPendingAdvice.ts";

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
    targetDescription: string;
    commandPreview?: string;
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

/** Build intent from an approved Aletheia advice card (B2.2 bridge). */
export function intentFromAdviceApproval(input: {
  sessionId: string;
  adviceId: string;
  kind: AletheiaAdviceKind;
  headline: string;
  body: string;
  command?: string;
  targetApp?: string;
}): ActionIntent | null {
  if (input.kind === "terminal_error" && input.command?.trim()) {
    const command = input.command.trim();
    return intentFromShell({
      command,
      sessionId: input.sessionId,
      rationale: input.body,
      targetApp: input.targetApp,
      glassActionId: `advice-${input.adviceId}`,
    });
  }
  return null;
}

/** Build intent from a shell command proposal. */
export function intentFromShell(input: {
  command: string;
  sessionId: string;
  rationale?: string;
  targetApp?: string;
  id?: string;
  glassActionId?: string;
}): ActionIntent {
  const command = input.command.trim();
  const preview =
    command.length > 72 ? `${command.slice(0, 72)}…` : command;
  return {
    id: input.id ?? makeIntentId(),
    sessionId: input.sessionId,
    kind: "shell",
    summary: `Run shell command: ${preview}`,
    rationale: input.rationale ?? "User approved Aletheia's suggested investigation.",
    scope: {
      description: `Single shell command in Glass terminal context`,
      targetApp: input.targetApp,
    },
    payload: {
      command,
      targetApp: input.targetApp,
    },
    requestedAt: Date.now(),
    glassActionId: input.glassActionId,
  };
}

export function targetDescriptionForIntent(intent: ActionIntent): string {
  if (intent.scope.targetApp) return intent.scope.targetApp;
  if (intent.kind === "shell") return "Glass shell";
  if (intent.kind === "file-write" || intent.kind === "file-apply") {
    return String(intent.payload.path ?? "file system");
  }
  if (intent.kind === "keystroke") {
    return String(intent.payload.targetApp ?? "active app");
  }
  return intent.scope.description;
}

export function commandPreviewForIntent(intent: ActionIntent): string | undefined {
  if (intent.kind === "shell") {
    return typeof intent.payload.command === "string" ? intent.payload.command : undefined;
  }
  if (intent.kind === "keystroke") {
    const text = typeof intent.payload.text === "string" ? intent.payload.text : "";
    if (!text) return undefined;
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }
  if (intent.kind === "file-write" || intent.kind === "file-apply") {
    return typeof intent.payload.path === "string" ? intent.payload.path : undefined;
  }
  return undefined;
}

export function buildPendingConfirmationView(intent: ActionIntent, narration: string) {
  return {
    intentId: intent.id,
    kind: intent.kind,
    summary: intent.summary,
    rationale: intent.rationale,
    scopeDescription: intent.scope.description,
    targetDescription: targetDescriptionForIntent(intent),
    commandPreview: commandPreviewForIntent(intent),
    narration,
    requestedAt: intent.requestedAt,
    glassActionId: intent.glassActionId,
  };
}

/** Apply a user modifier to a pending intent payload (B2.2). */
export function applyActionModifier(intent: ActionIntent, modifier: string): ActionIntent {
  const trimmed = modifier.trim();
  if (!trimmed) return intent;

  if (intent.kind === "shell") {
    const command = extractShellCommandFromModifier(trimmed) ?? trimmed;
    return {
      ...intent,
      summary: `Run shell command: ${command.length > 72 ? `${command.slice(0, 72)}…` : command}`,
      payload: { ...intent.payload, command },
    };
  }

  if (intent.kind === "keystroke") {
    const text = extractTextFromModifier(trimmed) ?? trimmed;
    return {
      ...intent,
      summary: `Type text into ${intent.scope.targetApp ?? "active app"}`,
      payload: { ...intent.payload, text },
    };
  }

  return intent;
}

function extractShellCommandFromModifier(text: string): string | undefined {
  const patterns = [
    /\bchange it to\s+(.+)/i,
    /\binstead run\s+(.+)/i,
    /\brun\s+(.+)\s+instead/i,
    /\buse\s+(.+)\s+instead/i,
  ];
  for (const re of patterns) {
    const match = text.match(re);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return undefined;
}

function extractTextFromModifier(text: string): string | undefined {
  const match = text.match(/\btype\s+(.+)/i);
  return match?.[1]?.trim();
}

export function confirmationFromUserTap(intentId: string): ActionConfirmation {
  return {
    intentId,
    confirmedAt: Date.now(),
    confirmedBy: "user-tap",
  };
}

