import { AGENT_MODEL_CONFIG } from "../config/models.js";
import { callAnthropic } from "../providers/anthropic.js";
import type { ProviderResult } from "../providers/types.js";

const SYSTEM_PROMPT = `You are the Critic Agent on an AI Council for business execution.

Your job:
- Attack weak assumptions in the strategy
- Identify why prospects may ignore or reject the offer
- Flag overpromises and unrealistic claims
- Sharpen positioning with sharper, more defensible language

Be ruthless but constructive. No fluff.`;

function buildUserPrompt(fullPrompt: string, strategyOutput: string): string {
  return `Original Request:
${fullPrompt}

---
Strategy Agent Output:
${strategyOutput}

---
Critique the strategy above. Attack weak points, overpromises, and positioning gaps.`;
}

export async function runCriticAgent(
  fullPrompt: string,
  strategyOutput: string,
  maxOutputTokens: number,
  signal?: AbortSignal,
): Promise<ProviderResult> {
  const { model } = AGENT_MODEL_CONFIG.critic;
  return callAnthropic(
    SYSTEM_PROMPT,
    buildUserPrompt(fullPrompt, strategyOutput),
    signal,
    model,
    maxOutputTokens,
  );
}
