/**
 * Glass Coder post-run orchestration — defer QA / verify until the run is
 * fully complete and no write approvals remain pending.
 */

export interface CoderRunSnapshot {
  runId: string;
  agentId: string;
  status: "running" | "done" | "error" | "cancelled";
}

export interface CoderHistorySnapshot {
  runId: string;
  status: "running" | "done" | "error" | "cancelled";
}

export function hasPendingCoderApprovals(
  runId: string,
  pending: { runId: string } | null | undefined,
  approvalKeys: Iterable<string>,
): boolean {
  if (pending?.runId === runId) return true;
  const prefix = `${runId}:`;
  for (const key of approvalKeys) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

export function isCoderRunComplete(
  runId: string,
  agentRun: CoderRunSnapshot | null | undefined,
  agentHistory: CoderHistorySnapshot[] | undefined,
): boolean {
  if (agentRun?.runId === runId && agentRun.status === "done") return true;
  return agentHistory?.some((h) => h.runId === runId && h.status === "done") ?? false;
}

/** True when another Coder run is actively executing — post-run for runId should abort. */
export function isCoderRunSuperseded(
  runId: string,
  agentRun: CoderRunSnapshot | null | undefined,
): boolean {
  return agentRun?.agentId === "coder"
    && agentRun.status === "running"
    && agentRun.runId !== runId;
}

/** Post-run may proceed when no other Coder run is actively executing. */
export function isCoderRunEligibleForPostRun(
  runId: string,
  agentRun: CoderRunSnapshot | null | undefined,
): boolean {
  return !isCoderRunSuperseded(runId, agentRun);
}

export interface CoderPostRunGateInput {
  runId: string;
  pendingApproval: { runId: string } | null | undefined;
  approvalKeys: Iterable<string>;
  agentRun: CoderRunSnapshot | null | undefined;
  agentHistory: CoderHistorySnapshot[] | undefined;
}

export type CoderPostRunBlockReason =
  | "superseded"
  | "incomplete"
  | "pending-approval"
  | null;

export function coderPostRunBlockReason(input: CoderPostRunGateInput): CoderPostRunBlockReason {
  if (isCoderRunSuperseded(input.runId, input.agentRun)) return "superseded";
  if (!isCoderRunComplete(input.runId, input.agentRun, input.agentHistory)) return "incomplete";
  if (hasPendingCoderApprovals(input.runId, input.pendingApproval, input.approvalKeys)) {
    return "pending-approval";
  }
  return null;
}

export function canStartCoderPostRun(input: CoderPostRunGateInput): boolean {
  return coderPostRunBlockReason(input) === null;
}
