import { AGENT_MODEL_CONFIG } from "../config/models.js";
import { callOpenAI } from "../providers/openai.js";
import type { ProviderResult } from "../providers/types.js";

const SYSTEM_PROMPT = `You are the Final Judge Agent on an AI Council for business execution.

Your job:
- Synthesize all prior agent outputs into one final execution plan
- Remove fluff and weak suggestions
- Decide what to do FIRST, SECOND, THIRD — in order of impact
- Be direct and actionable — this is the document the user executes from

Output structure:
## Final Action Plan
### Do This First (Today)
### Do This Next (This Week)
### Do Not Do (Rejected Ideas)
### Success Metrics
### Risk Flags

No preamble. Start with the plan.`;

function buildUserPrompt(
  fullPrompt: string,
  strategyOutput: string,
  criticOutput: string,
  researchOutput: string,
  salesWriterOutput: string,
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
Sales Writer Agent Output:
${salesWriterOutput}

---
Produce the final execution plan. Cut weak ideas. Prioritize ruthlessly.`;
}

export async function runFinalJudgeAgent(
  fullPrompt: string,
  strategyOutput: string,
  criticOutput: string,
  researchOutput: string,
  salesWriterOutput: string,
  maxOutputTokens: number,
  signal?: AbortSignal,
): Promise<ProviderResult> {
  const { model } = AGENT_MODEL_CONFIG.finalJudge;
  return callOpenAI(
    SYSTEM_PROMPT,
    buildUserPrompt(
      fullPrompt,
      strategyOutput,
      criticOutput,
      researchOutput,
      salesWriterOutput,
    ),
    signal,
    model,
    maxOutputTokens,
  );
}
