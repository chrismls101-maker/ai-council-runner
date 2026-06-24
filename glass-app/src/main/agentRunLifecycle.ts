/**
 * Agent run outcome — bridges IPC events and AgentEventBus lifecycle publishes.
 */

export type AgentRunOutcome = "done" | "error" | "cancelled";

export interface AgentChainMetadata {
  draftAfter?: boolean;
  draftPrompt?: string;
}

export interface AgentRunResult {
  outcome: AgentRunOutcome;
  error?: string;
  recoverable?: boolean;
  outputPath?: string;
  summary?: string;
  /** @deprecated Prefer outputExcerpt — kept for research chain compat */
  researchExcerpt?: string;
  /** Final agent text for memory / downstream (report body, assistant reply, etc.) */
  outputExcerpt?: string;
}

const NON_RECOVERABLE_CODER_PATTERNS = [
  /api key/i,
  /network error/i,
  /cancelled/i,
  /token limit/i,
  /maximum loop/i,
  /unauthorized/i,
  /perplexity api key/i,
  /openai api key/i,
  /anthropic api key/i,
  /stream ended unexpectedly/i,
];

export function isRecoverableCoderError(error: string): boolean {
  const text = error.trim();
  if (!text) return false;
  return !NON_RECOVERABLE_CODER_PATTERNS.some((pattern) => pattern.test(text));
}

export function agentRunDone(
  summary?: string,
  outputPath?: string,
  researchExcerpt?: string,
  outputExcerpt?: string,
): AgentRunResult {
  const excerpt = outputExcerpt ?? researchExcerpt;
  return { outcome: "done", summary, outputPath, researchExcerpt: excerpt, outputExcerpt: excerpt };
}

export function agentRunError(error: string, recoverable?: boolean): AgentRunResult {
  const rec = recoverable ?? isRecoverableCoderError(error);
  return { outcome: "error", error, recoverable: rec };
}

export function agentRunCancelled(): AgentRunResult {
  return { outcome: "cancelled" };
}
