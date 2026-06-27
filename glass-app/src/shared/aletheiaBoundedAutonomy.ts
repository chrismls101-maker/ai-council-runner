/**
 * Aletheia bounded autonomy (B2.3).
 *
 * Declared scope before a loop, live audit trail, and a clean end summary.
 */

import { randomUUID } from "node:crypto";

export type BoundedLoopKind = "terminal_investigation";

export type BoundedLoopPhase = "awaiting_confirm" | "running" | "complete" | "failed";

export interface BoundedLoopConfig {
  kind: BoundedLoopKind;
  maxIterations: number;
  scopeDeclaration: string;
}

export interface BoundedLoopScope {
  loopId: string;
  kind: BoundedLoopKind;
  declaration: string;
  maxIterations: number;
  command: string;
  targetApp?: string;
  allowedActions: string[];
}

export interface BoundedLoopAuditRow {
  id: string;
  iteration: number;
  narration: string;
  ok: boolean | null;
  detail?: string;
  createdAt: number;
}

export interface AletheiaBoundedLoopSnapshot {
  loopId: string;
  phase: BoundedLoopPhase;
  scope: BoundedLoopScope;
  iteration: number;
  audit: BoundedLoopAuditRow[];
  summary?: string;
  updatedAt: number;
}

export const TERMINAL_INVESTIGATION_MAX_ITERATIONS = 3;

export function buildTerminalInvestigationScope(
  command: string,
  targetApp?: string,
  maxIterations = TERMINAL_INVESTIGATION_MAX_ITERATIONS,
): BoundedLoopScope {
  const preview =
    command.length > 64 ? `${command.slice(0, 64)}…` : command;
  return {
    loopId: randomUUID(),
    kind: "terminal_investigation",
    declaration: buildTerminalInvestigationScopeDeclaration(command, maxIterations),
    maxIterations,
    command,
    targetApp,
    allowedActions: [
      `Re-run \`${preview}\` up to ${maxIterations} times`,
      "Capture stdout/stderr for each attempt",
      "Stop early when the command succeeds",
      "No file edits or unrelated shell commands",
    ],
  };
}

export function buildTerminalInvestigationScopeDeclaration(
  command: string,
  maxIterations: number,
): string {
  const preview =
    command.length > 64 ? `${command.slice(0, 64)}…` : command;
  return `I'll re-run \`${preview}\` up to ${maxIterations} times in the Glass terminal, audit each attempt, and summarize what changed. I won't edit files or run other commands.`;
}

export function boundedLoopConfigFromScope(scope: BoundedLoopScope): BoundedLoopConfig {
  return {
    kind: scope.kind,
    maxIterations: scope.maxIterations,
    scopeDeclaration: scope.declaration,
  };
}

export function initialBoundedLoopSnapshot(scope: BoundedLoopScope, now = Date.now()): AletheiaBoundedLoopSnapshot {
  return {
    loopId: scope.loopId,
    phase: "running",
    scope,
    iteration: 0,
    audit: [],
    updatedAt: now,
  };
}

export function appendBoundedLoopAudit(
  snapshot: AletheiaBoundedLoopSnapshot,
  input: {
    iteration: number;
    narration: string;
    ok: boolean | null;
    detail?: string;
    now?: number;
  },
): AletheiaBoundedLoopSnapshot {
  const row: BoundedLoopAuditRow = {
    id: randomUUID(),
    iteration: input.iteration,
    narration: input.narration,
    ok: input.ok,
    detail: input.detail,
    createdAt: input.now ?? Date.now(),
  };
  return {
    ...snapshot,
    iteration: input.iteration,
    audit: [...snapshot.audit, row],
    updatedAt: input.now ?? Date.now(),
  };
}

export function finalizeBoundedLoopSnapshot(
  snapshot: AletheiaBoundedLoopSnapshot,
  input: { ok: boolean; summary: string; now?: number },
): AletheiaBoundedLoopSnapshot {
  return {
    ...snapshot,
    phase: input.ok ? "complete" : "failed",
    summary: input.summary,
    updatedAt: input.now ?? Date.now(),
  };
}

export function buildBoundedLoopSummary(
  scope: BoundedLoopScope,
  audit: readonly BoundedLoopAuditRow[],
  finalOk: boolean,
): string {
  const iterations = audit.length;
  const fixesApplied = audit.filter((row) => row.ok === true).length;
  const lastDetail = audit[audit.length - 1]?.detail?.trim();

  if (finalOk) {
    const early =
      iterations < scope.maxIterations
        ? `stopped after ${iterations} iteration${iterations === 1 ? "" : "s"}`
        : `used all ${iterations} iterations`;
    const tail = lastDetail ? ` Latest output: ${clip(lastDetail, 140)}` : "";
    return `I ran ${iterations} iteration${iterations === 1 ? "" : "s"} on the failing command and it now passes (${early}).${tail}`;
  }

  const tail = lastDetail ? ` Last output: ${clip(lastDetail, 140)}` : "";
  return `I ran ${iterations} iteration${iterations === 1 ? "" : "s"} on \`${clip(scope.command, 48)}\` and it is still failing.${tail}`;
}

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function readBoundedLoopConfig(payload: Record<string, unknown>): BoundedLoopConfig | null {
  const raw = payload.boundedLoop;
  if (!raw || typeof raw !== "object") return null;
  const config = raw as BoundedLoopConfig;
  if (config.kind !== "terminal_investigation") return null;
  if (!Number.isFinite(config.maxIterations) || config.maxIterations < 1) return null;
  if (!config.scopeDeclaration?.trim()) return null;
  return config;
}

export function boundedLoopSnapshotsEqual(
  a: AletheiaBoundedLoopSnapshot | null | undefined,
  b: AletheiaBoundedLoopSnapshot | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.loopId !== b.loopId) return false;
  if (a.phase !== b.phase) return false;
  if (a.iteration !== b.iteration) return false;
  if (a.summary !== b.summary) return false;
  if (a.audit.length !== b.audit.length) return false;
  return true;
}
