/** Glass IDE — unified presence phase for ambient editor chrome. */

import type { GlassAskStatus } from "./glassAskTypes.ts";
import type { DiffLine } from "./diff.ts";
import type { GlassAgentId } from "./ipc.ts";

export type GlassIdePresencePhase =
  | "idle"
  | "listening"
  | "thinking"
  | "approval"
  | "answering";

export interface GlassIdePresenceInput {
  privacyListening: boolean;
  askStatus: GlassAskStatus;
  agentRun?: {
    agentId: GlassAgentId;
    status: "running" | "done" | "error" | "cancelled";
  } | null;
  agentPendingApproval?: {
    agentId: GlassAgentId;
    runId: string;
  } | null;
  partialAnswer?: string;
}

export function deriveGlassIdePresencePhase(input: GlassIdePresenceInput): GlassIdePresencePhase {
  const coderPending = input.agentPendingApproval?.agentId === "coder";
  if (coderPending) return "approval";

  const coderRunning =
    input.agentRun?.agentId === "coder" && input.agentRun.status === "running";
  if (coderRunning) return "thinking";

  if (input.askStatus === "pending" || input.askStatus === "streaming") {
    return "thinking";
  }

  if (input.askStatus === "done" && input.partialAnswer?.trim()) {
    return "answering";
  }

  if (input.privacyListening) return "listening";

  return "idle";
}

/** Calm label — null when idle so chrome stays quiet. */
export function glassIdePresenceLabel(phase: GlassIdePresencePhase): string | null {
  switch (phase) {
    case "listening":
      return "Listening";
    case "thinking":
      return "IIVO is thinking";
    case "approval":
      return "Review change";
    case "answering":
      return "IIVO";
    default:
      return null;
  }
}

export function glassIdePresencePriority(phase: GlassIdePresencePhase): number {
  switch (phase) {
    case "approval":
      return 50;
    case "thinking":
      return 40;
    case "answering":
      return 30;
    case "listening":
      return 20;
    default:
      return 0;
  }
}

/** Lines to pulse after a Coder proposal or apply. */
export function linesToPulseFromDisplay(
  displayLines: DiffLine[] | undefined,
): number[] {
  if (!displayLines?.length) return [];
  const lines = new Set<number>();
  for (const line of displayLines) {
    if (line.collapsed != null) continue;
    if (line.op === "remove" && line.beforeLineNo != null) lines.add(line.beforeLineNo);
    if (line.op === "add" && line.afterLineNo != null) lines.add(line.afterLineNo);
  }
  return [...lines].sort((a, b) => a - b).slice(0, 12);
}
