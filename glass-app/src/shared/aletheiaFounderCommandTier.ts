/**
 * Aletheia Founder Command Tier (B8) — explicit Deployed Execution for founder only.
 *
 * B8.1 — invoke, expanded authority, ledger attribution
 * B8.2 — deactivate, session-end boundary, audit trail
 */

import type { IivoAccountLink } from "./iivoAccountLink.ts";
import type { ActionIntent, PipelineStage } from "./aletheiaExecution.ts";
import { makeIntentId } from "./aletheiaExecution.ts";

export const FOUNDER_COMMAND_LEDGER_ATTRIBUTION = "founder-command-session" as const;

export const DEPLOYED_EXECUTION_CONFIRMATION =
  "Founder Command Tier active. Deployed Execution active. Authority expanded. Executing at founder scope.";

export const DEPLOYED_EXECUTION_DEACTIVATION =
  "Returning to standard mode.";

export const DEPLOYED_EXECUTION_HEADER_LABEL =
  "Founder Command Tier · Deployed Execution";

/** Extended bounded-loop ceiling while Deployed Execution is active. */
export const DEPLOYED_EXECUTION_MAX_LOOP_ITERATIONS = 8;

export interface AletheiaDeployedExecutionSnapshot {
  active: boolean;
  activatedAt?: number;
  deactivatedAt?: number;
  sessionId?: string;
  headerLabel: string;
}

export function isFounderAccount(accountLink?: IivoAccountLink | null): boolean {
  return accountLink?.role === "founder";
}

/** Only the linked founder account may invoke Deployed Execution — no admin path. */
export function canInvokeDeployedExecution(accountLink?: IivoAccountLink | null): boolean {
  return isFounderAccount(accountLink);
}

export function isDeployedExecutionActive(
  snapshot?: AletheiaDeployedExecutionSnapshot | null,
): boolean {
  return snapshot?.active === true;
}

/** Active Deployed Execution session for a linked founder account only. */
export function isDeployedExecutionEffective(
  snapshot?: AletheiaDeployedExecutionSnapshot | null,
  accountLink?: IivoAccountLink | null,
): boolean {
  return isDeployedExecutionActive(snapshot) && isFounderAccount(accountLink);
}

export function activateDeployedExecution(
  sessionId: string,
  now = Date.now(),
): AletheiaDeployedExecutionSnapshot {
  return {
    active: true,
    activatedAt: now,
    sessionId,
    headerLabel: DEPLOYED_EXECUTION_HEADER_LABEL,
  };
}

export function deactivateDeployedExecution(now = Date.now()): undefined {
  void now;
  return undefined;
}

export function effectiveBoundedLoopMaxIterations(
  defaultMax: number,
  deployedExecutionActive: boolean,
): number {
  if (!deployedExecutionActive) return defaultMax;
  return Math.max(defaultMax, DEPLOYED_EXECUTION_MAX_LOOP_ITERATIONS);
}

export function makeFounderCommandBoundaryIntent(sessionId: string): ActionIntent {
  return {
    id: makeIntentId(),
    sessionId,
    kind: "delegated",
    summary: "Founder command tier boundary",
    rationale: "Audit marker for Deployed Execution session boundary.",
    scope: { description: "Founder command tier session boundary" },
    payload: {},
    requestedAt: Date.now(),
  };
}

export function founderCommandBoundaryNarration(
  kind: "opened" | "closed",
  sessionId: string,
): string {
  if (kind === "opened") {
    return `Founder Command Tier opened (${sessionId}) — Deployed Execution active.`;
  }
  return `Founder Command Tier closed (${sessionId}) — returning to standard mode.`;
}

export function founderCommandBoundaryStage(kind: "opened" | "closed"): PipelineStage {
  return kind === "opened" ? "intent" : "complete";
}

export function deployedExecutionSnapshotsEqual(
  a: AletheiaDeployedExecutionSnapshot | undefined,
  b: AletheiaDeployedExecutionSnapshot | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.active === b.active && a.sessionId === b.sessionId && a.activatedAt === b.activatedAt;
}
