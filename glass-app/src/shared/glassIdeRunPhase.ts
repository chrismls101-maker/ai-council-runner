/**
 * Glass IDE Coder — run phase semantics for stream chrome (Inspect → Finish).
 */

import type { CoderTranscriptItem } from "./glassIdeCoderTranscript.ts";
import { isCoderWriteTool } from "./glassIdeCoderTranscript.ts";

export type CoderRunPhase =
  | "inspect"
  | "edit"
  | "apply"
  | "verify"
  | "recover"
  | "finish";

const INSPECT_TOOLS = new Set(["read_file", "list_directory", "search_files", "web_search"]);

export function coderRunPhaseLabel(phase: CoderRunPhase): string {
  switch (phase) {
    case "inspect":
      return "Inspect";
    case "edit":
      return "Edit";
    case "apply":
      return "Apply";
    case "verify":
      return "Verify";
    case "recover":
      return "Recover";
    case "finish":
      return "Complete";
    default:
      return "Run";
  }
}

export function deriveCoderRunPhase(input: {
  agentRunning: boolean;
  agentDone: boolean;
  agentFailed: boolean;
  approvalPending: boolean;
  loopIteration?: number;
  verifyStatus?: "idle" | "running" | "pass" | "fail";
  qaRunning?: boolean;
  transcript: CoderTranscriptItem[];
}): CoderRunPhase | null {
  const {
    agentRunning,
    agentDone,
    agentFailed,
    approvalPending,
    loopIteration,
    verifyStatus,
    qaRunning,
    transcript,
  } = input;

  if (!agentRunning && !agentDone && !agentFailed && !approvalPending
    && verifyStatus !== "running" && !qaRunning) {
    return null;
  }

  if (approvalPending) return "apply";

  if (verifyStatus === "running" || qaRunning) return "verify";

  if (agentRunning && loopIteration && loopIteration > 1) return "recover";

  if (agentDone && !agentFailed) return "finish";

  if (agentFailed) return "recover";

  const lastTool = [...transcript].reverse().find((item) => item.kind === "tool");
  if (lastTool?.kind === "tool") {
    if (lastTool.toolName === "run_project_command" && lastTool.status === "running") {
      return "verify";
    }
    if (isCoderWriteTool(lastTool.toolName)) {
      return lastTool.status === "running" ? "edit" : "apply";
    }
    if (INSPECT_TOOLS.has(lastTool.toolName) && lastTool.status === "running") {
      return "inspect";
    }
  }

  if (agentRunning) return "inspect";

  return agentDone ? "finish" : null;
}
