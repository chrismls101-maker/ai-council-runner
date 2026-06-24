/**
 * Glass IDE Coder — stream status label (shared, testable).
 */

import type { GlassState } from "./ipc.ts";

export function coderStreamStatusLabel(
  agentRun: GlassState["agentRun"],
  pending: GlassState["agentPendingApproval"],
  activeRunId: string | null,
  loopIteration?: number,
): string {
  const loopSuffix = loopIteration && loopIteration > 1
    ? ` (pass ${loopIteration}/4)`
    : "";
  if (pending && activeRunId && pending.runId === activeRunId) {
    return `Waiting for approval…${loopSuffix}`;
  }
  if (agentRun?.status === "running") return `Running…${loopSuffix}`;
  if (agentRun?.status === "done") return `Done${loopSuffix}`;
  if (agentRun?.status === "error") return `Failed${loopSuffix}`;
  if (agentRun?.status === "cancelled") return `Stopped${loopSuffix}`;
  return loopIteration && loopIteration > 1
    ? `Glass Coder (pass ${loopIteration}/4)`
    : "Glass Coder";
}
