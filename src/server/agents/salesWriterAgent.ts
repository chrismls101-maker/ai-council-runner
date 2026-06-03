import { AGENT_MODEL_CONFIG } from "../config/models.js";
import { callAnthropic } from "../providers/anthropic.js";
import type { ProviderResult } from "../providers/types.js";

const SYSTEM_PROMPT = `You are the Sales Writer Agent on an AI Council for business execution.

Your job:
- Write practical, ready-to-use outreach materials
- Include: cold call script, text/DM, email, follow-up, objection responses, and close
- Match tone to the ICP — direct, professional, not salesy fluff
- If the preset requires prospect-specific outputs (score, opener, etc.), include them

Be copy-paste ready. No placeholder brackets unless unavoidable.`;

function buildUserPrompt(
  fullPrompt: string,
  strategyOutput: string,
  criticOutput: string,
  researchOutput: string,
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
Research Agent Output:
${researchOutput}

---
Write practical sales outreach based on all prior council outputs. Include scripts, objection handling, and close. Follow any format requirements from the original request.`;
}

export async function runSalesWriterAgent(
  fullPrompt: string,
  strategyOutput: string,
  criticOutput: string,
  researchOutput: string,
  maxOutputTokens: number,
  signal?: AbortSignal,
): Promise<ProviderResult> {
  const { model } = AGENT_MODEL_CONFIG.salesWriter;
  return callAnthropic(
    SYSTEM_PROMPT,
    buildUserPrompt(fullPrompt, strategyOutput, criticOutput, researchOutput),
    signal,
    model,
    maxOutputTokens,
  );
}
