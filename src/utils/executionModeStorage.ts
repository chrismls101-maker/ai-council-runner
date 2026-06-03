import type { ExecutionMode } from "../types/executionMode";

const KEY = "iivo_execution_mode_v1";
const LEGACY_WORKFLOW_KEY = "iivo_workflow_preference";

const VALID: ExecutionMode[] = ["auto", "quick", "council", "builder"];

export function loadExecutionMode(): ExecutionMode {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && VALID.includes(raw as ExecutionMode)) {
      return raw as ExecutionMode;
    }
    const legacy = localStorage.getItem(LEGACY_WORKFLOW_KEY);
    if (legacy === "auto" || legacy === "direct_answer") {
      return "auto";
    }
  } catch {
    /* ignore */
  }
  return "auto";
}

export function saveExecutionMode(mode: ExecutionMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
}
