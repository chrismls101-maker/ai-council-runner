import type { DiffLine } from "./diff.ts";
import type { AgentPendingApprovalPayload, GlassState } from "./ipc.ts";

/** First line to reveal in the editor for a collapsed unified diff. */
export function firstChangedLineFromDisplay(lines: DiffLine[]): number {
  for (const line of lines) {
    if (line.collapsed != null) continue;
    if (line.op === "remove" && line.beforeLineNo != null) return line.beforeLineNo;
    if (line.op === "add" && line.afterLineNo != null) return line.afterLineNo;
  }
  return 1;
}

export function normalizeIdeRelativePath(path: string): string {
  return path.trim().replace(/\\/g, "/");
}

export function pathsMatchRelative(a: string, b: string): boolean {
  return normalizeIdeRelativePath(a) === normalizeIdeRelativePath(b);
}

export function getActiveCoderRunId(state: GlassState, fallbackRunId: string | null): string | null {
  if (state.agentRun?.agentId === "coder") return state.agentRun.runId;
  return fallbackRunId;
}

export function getCoderPendingApproval(
  state: GlassState,
  activeRunId: string | null,
): (AgentPendingApprovalPayload & {
  runId: string;
  pendingToolId: string;
  agentId: string;
}) | null {
  const pending = state.agentPendingApproval;
  if (!pending || pending.agentId !== "coder") return null;
  if (!activeRunId || pending.runId !== activeRunId) return null;
  return pending;
}
