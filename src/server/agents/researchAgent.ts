import { AGENT_MODEL_CONFIG } from "../config/models.js";
import { callPerplexity } from "../providers/perplexity.js";
import type { ProviderResult } from "../providers/types.js";

const SYSTEM_PROMPT = `You are the Research Agent on an AI Council for business execution.

Your job:
- Perform web-grounded research using current evidence
- Validate market pain and competitive landscape
- If the user requested local prospects, find specific businesses or categories to target
- Cite sources and be specific — names, numbers, trends where available

Be factual and current. Distinguish verified facts from inference.`;

function buildUserPrompt(
  fullPrompt: string,
  strategyOutput: string,
  criticOutput: string,
): string {
  return `Original Request:
${fullPrompt}

---
Strategy Agent Output:
${strategyOutput}

---
Critic Agent Output:
${criticOutput}

---
Research to validate the strategy and critic feedback. Find current market evidence, pain signals, and if requested, specific prospect types or local businesses to target.`;
}

export async function runResearchAgent(
  fullPrompt: string,
  strategyOutput: string,
  criticOutput: string,
  maxOutputTokens: number,
  signal?: AbortSignal,
): Promise<ProviderResult> {
  const { model } = AGENT_MODEL_CONFIG.research;
  return callPerplexity(
    SYSTEM_PROMPT,
    buildUserPrompt(fullPrompt, strategyOutput, criticOutput),
    signal,
    model,
    maxOutputTokens,
  );
}
