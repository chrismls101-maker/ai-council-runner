import type { ExecutionMode, ExecutionModeDecision } from "../types/executionMode";

export async function previewExecutionMode(
  prompt: string,
  executionMode: ExecutionMode,
  options?: { wantsVision?: boolean; inBuilderWorkspace?: boolean },
): Promise<ExecutionModeDecision> {
  const res = await fetch("/api/execution-mode/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      executionMode,
      wantsVision: options?.wantsVision ?? false,
      inBuilderWorkspace: options?.inBuilderWorkspace ?? false,
    }),
  });
  if (!res.ok) {
    throw new Error("Could not preview execution mode");
  }
  return (await res.json()) as ExecutionModeDecision;
}
