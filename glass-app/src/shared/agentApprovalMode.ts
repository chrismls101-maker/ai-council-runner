/**
 * Glass Coder approval batching — trust or skip remaining edits in a run.
 */

export type CoderApprovalMode = "normal" | "trust_edits" | "skip_all";

export function shouldAutoApproveCoderTool(
  mode: CoderApprovalMode,
  toolName: string,
): boolean {
  if (mode !== "trust_edits") return false;
  return toolName === "edit_file" || toolName === "create_file";
}

export function shouldAutoSkipCoderTool(mode: CoderApprovalMode): boolean {
  return mode === "skip_all";
}

export function requiresManualApproval(toolName: string): boolean {
  return toolName === "delete_file";
}
