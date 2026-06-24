/**
 * Resolve agent bus output for memory persistence (filesystem only).
 */

import { readFile } from "node:fs/promises";
import type { AgentCompletePayload } from "./agentEventBus.ts";

const MAX_AGENT_OUTPUT_CHARS = 50_000;

export async function resolveAgentOutputForMemory(
  payload: AgentCompletePayload,
): Promise<string> {
  const excerpt = payload.outputExcerpt ?? payload.researchExcerpt;
  if (excerpt?.trim()) {
    return excerpt.trim().slice(0, MAX_AGENT_OUTPUT_CHARS);
  }

  if (payload.outputPath?.trim()) {
    try {
      const text = await readFile(payload.outputPath.trim(), "utf-8");
      if (text.trim()) {
        return text.trim().slice(0, MAX_AGENT_OUTPUT_CHARS);
      }
    } catch (err) {
      console.warn("[memory] read agent outputPath failed:", err);
    }
  }

  const summary = payload.summary?.trim() ?? "";
  if (summary && !/ agent finished$/i.test(summary)) {
    return summary.slice(0, MAX_AGENT_OUTPUT_CHARS);
  }

  return "";
}
