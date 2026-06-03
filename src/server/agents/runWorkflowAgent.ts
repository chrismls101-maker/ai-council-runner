import { AGENT_MODEL_CONFIG } from "../config/models.js";
import type { WorkflowDefinition } from "../config/workflows.js";
import { runResearchAgent } from "../agents/runResearchAgent.js";
import {
  detectResearchMode,
  ENTITY_SEARCH_FINAL_JUDGE_APPEND,
  ENTITY_SEARCH_SALES_WRITER_APPEND,
} from "../agents/researchIntent.js";
import { callAnthropic } from "../providers/anthropic.js";
import { callOpenAI } from "../providers/openai.js";
import type { ProviderResult } from "../providers/types.js";
import type { AgentId, AgentOutputs } from "../types/index.js";
import {
  buildContractInstruction,
  buildFinalJudgeContractTask,
} from "../responseContracts/contractFormatter.js";
import { buildCouncilCompressionInstruction } from "../responseContracts/councilCompression.js";
import type { ResponsePlan } from "../responseContracts/resolveResponsePlan.js";

const SLOT_LABELS: Record<AgentId, string> = {
  strategy: "Strategy",
  critic: "Critic",
  research: "Research",
  salesWriter: "Sales Writer",
  finalJudge: "Final Judge",
};

function buildUserPrompt(
  slot: AgentId,
  fullPrompt: string,
  outputs: AgentOutputs,
  researchSources?: string[],
): string {
  // Sequential chain: each agent receives the original prompt plus all prior agent outputs.
  const sections: string[] = [`Original Request:\n${fullPrompt}`];

  if (slot !== "strategy") {
    sections.push(`---\n${SLOT_LABELS.strategy} Output:\n${outputs.strategy}`);
  }
  if (["research", "salesWriter", "finalJudge"].includes(slot)) {
    sections.push(`---\n${SLOT_LABELS.critic} Output:\n${outputs.critic}`);
  }
  if (["salesWriter", "finalJudge"].includes(slot)) {
    sections.push(`---\n${SLOT_LABELS.research} Output:\n${outputs.research}`);
    if (researchSources && researchSources.length > 0) {
      sections.push(
        `---\nResearch Sources (reference only, do not invent new ones):\n${researchSources.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
      );
    }
  }
  if (slot === "finalJudge") {
    sections.push(
      `---\n${SLOT_LABELS.salesWriter} Output:\n${outputs.salesWriter}`,
    );
  }

  const task =
    slot === "strategy"
      ? "Analyze the request above."
      : slot === "critic"
        ? "Critique the strategy above."
        : slot === "research"
          ? "Research and validate using current evidence."
          : slot === "salesWriter"
            ? "Produce practical output based on all prior council work."
            : "Produce the final execution plan. Cut weak ideas. Prioritize ruthlessly.";

  sections.push(`---\n${task}`);
  return sections.join("\n\n");
}

function buildUserPromptWithContract(
  slot: AgentId,
  fullPrompt: string,
  outputs: AgentOutputs,
  researchSources: string[] | undefined,
  responsePlan?: ResponsePlan,
): string {
  let prompt = buildUserPrompt(slot, fullPrompt, outputs, researchSources);
  if (slot === "finalJudge" && responsePlan) {
    prompt = prompt.replace(
      /Produce the final execution plan\. Cut weak ideas\. Prioritize ruthlessly\./,
      buildFinalJudgeContractTask(responsePlan.contract),
    );
  }
  if (slot === "salesWriter" && responsePlan?.contract.id === "deliverable_first") {
    prompt += `\n\n---\nFocus on drafting the actual deliverable (email, script, message) the user requested.`;
  }
  return prompt;
}

export async function runWorkflowAgent(
  slot: AgentId,
  workflow: WorkflowDefinition,
  fullPrompt: string,
  outputs: AgentOutputs,
  maxOutputTokens: number,
  researchSources: string[] | undefined,
  signal?: AbortSignal,
  entitySearchPrompt?: string,
  responsePlan?: ResponsePlan,
): Promise<ProviderResult> {
  const agentDef = workflow.agents[slot];
  const researchMode = detectResearchMode(fullPrompt, workflow.id);
  const entitySearchMode = researchMode === "entity_search";

const PAST_OUTCOMES_FINAL_JUDGE_APPEND = `

IMPORTANT — Relevant Past Outcomes are in the Original Request context below.

Before ## Final Action Plan, add a short section titled "## Relevant past outcome" OR "## Based on your tracked outcome" (2–4 sentences). This section is required when past outcomes are present.

In that section you MUST:
1. Mention the previous action taken (use the exact wording from the context when available)
2. Mention the outcome status (in progress, worked, did not work, etc.)
3. Mention at least one metric/result OR lesson from the tracked outcome
4. State clearly whether the outcome is conclusive evidence or not

Outcome status rules:
- worked = can be treated as positive evidence
- did_not_work = avoid repeating without revision
- needs_revision = revise before repeating
- in_progress = mention cautiously; do NOT treat as proof; use language like "still testing", "not conclusive", "not enough evidence", "do not assume it worked", "gather more data"
- not_started = do not use as evidence

Example (in_progress):
"Your last tracked outcome is still in progress: you ran a small validation test and are gathering more data. That is not enough evidence to say the strategy worked or failed yet."

After this section, continue with ## Final Action Plan and the rest of the required structure. Keep the past-outcome section concise — do not repeat the entire context block.`;

  let systemPrompt = agentDef.systemPrompt;
  if (entitySearchMode && slot === "finalJudge") {
    systemPrompt += ENTITY_SEARCH_FINAL_JUDGE_APPEND;
  }
  if (entitySearchMode && slot === "salesWriter") {
    systemPrompt += ENTITY_SEARCH_SALES_WRITER_APPEND;
  }
  if (
    slot === "finalJudge" &&
    fullPrompt.includes("Relevant Past Outcomes:") &&
    responsePlan?.contract.id !== "deliverable_first" &&
    responsePlan?.contract.id !== "rewrite_only" &&
    responsePlan?.contract.id !== "summary_first"
  ) {
    systemPrompt += PAST_OUTCOMES_FINAL_JUDGE_APPEND;
  }

  if (responsePlan && (slot === "finalJudge" || slot === "salesWriter")) {
    systemPrompt += buildContractInstruction(responsePlan.contract, responsePlan.intent);
    if (slot === "finalJudge") {
      systemPrompt += buildCouncilCompressionInstruction(
        responsePlan.lane.lane,
        responsePlan.contract,
      );
    }
  }

  const userPrompt = buildUserPromptWithContract(
    slot,
    fullPrompt,
    outputs,
    slot === "finalJudge" ? researchSources : undefined,
    responsePlan,
  );

  const { model } = AGENT_MODEL_CONFIG[slot];

  if (slot === "research") {
    return runResearchAgent(
      workflow,
      fullPrompt,
      outputs,
      maxOutputTokens,
      signal,
      entitySearchPrompt,
    );
  }

  if (slot === "strategy" || slot === "finalJudge") {
    return callOpenAI(
      systemPrompt,
      userPrompt,
      signal,
      model,
      maxOutputTokens,
    );
  }
  if (slot === "critic" || slot === "salesWriter") {
    return callAnthropic(
      systemPrompt,
      userPrompt,
      signal,
      model,
      maxOutputTokens,
    );
  }

  throw new Error(`Unsupported agent slot: ${slot}`);
}
