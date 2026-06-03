import { AGENT_MODEL_CONFIG } from "../config/models.js";
import { callOpenAI } from "../providers/openai.js";
import type { ProviderResult } from "../providers/types.js";

const SYSTEM_PROMPT = `You are the Strategy Agent on an AI Council for business execution.

Your job:
- Analyze the user's business problem
- Identify the best niche, offer, buyer pain, pricing angle, and fastest path to proof
- Be direct and tactical — no fluff, no generic advice

Output structure:
1. Problem Summary
2. Best Niche / ICP
3. Core Offer
4. Buyer Pain (ranked)
5. Pricing Angle
6. Fastest Path to Proof (48–72 hour actions)
7. Key Assumptions to Validate`;

export async function runStrategyAgent(
  fullPrompt: string,
  maxOutputTokens: number,
  signal?: AbortSignal,
): Promise<ProviderResult> {
  const { model } = AGENT_MODEL_CONFIG.strategy;
  return callOpenAI(SYSTEM_PROMPT, fullPrompt, signal, model, maxOutputTokens);
}
