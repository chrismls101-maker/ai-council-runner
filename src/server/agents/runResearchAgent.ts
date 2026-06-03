import type { WorkflowDefinition } from "../config/workflows.js";
import {
  formatEntitySearchReport,
  generateEntitySearchQueries,
  validateAndExtractEntities,
} from "./entityValidator.js";
import { detectResearchMode } from "./researchIntent.js";
import { callPerplexity } from "../providers/perplexity.js";
import {
  buildSearchApiProviderResult,
  runPerplexityEntitySearch,
} from "../providers/perplexitySearch.js";
import type { ProviderResult } from "../providers/types.js";
import type { AgentOutputs } from "../types/index.js";

const SLOT_LABELS = {
  strategy: "Strategy",
  critic: "Critic",
  research: "Research",
  salesWriter: "Sales Writer",
  finalJudge: "Final Judge",
};

function buildSonarUserPrompt(fullPrompt: string, outputs: AgentOutputs): string {
  const sections: string[] = [`Original Request:\n${fullPrompt}`];
  sections.push(`---\n${SLOT_LABELS.strategy} Output:\n${outputs.strategy}`);
  sections.push(`---\n${SLOT_LABELS.critic} Output:\n${outputs.critic}`);
  sections.push("---\nResearch and validate using current evidence.");
  return sections.join("\n\n");
}

function parseCategoryLocation(prompt: string): {
  category: string;
  location: string;
} {
  const queries = generateEntitySearchQueries(prompt);
  const locationMatch = prompt.match(
    /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*,\s*[A-Z]{2})\b/,
  );
  const location =
    locationMatch?.[1] ??
    prompt.match(/\b(?:in|near)\s+([A-Za-z\s,]+)/i)?.[1]?.trim() ??
    "";

  const lower = prompt.toLowerCase();
  let category = "business";
  if (lower.includes("plumb")) category = "plumber";
  else if (lower.includes("hvac")) category = "HVAC";
  else if (lower.includes("electric")) category = "electrician";

  void queries;
  return { category, location };
}

function buildCouncilContextSection(outputs: AgentOutputs): string {
  return [
    "Prior council outputs (sequential chain):",
    "",
    `${SLOT_LABELS.strategy} Output:`,
    outputs.strategy.trim() || "(empty)",
    "",
    `${SLOT_LABELS.critic} Output:`,
    outputs.critic.trim() || "(empty)",
    "",
    "---",
  ].join("\n");
}

async function runEntitySearchResearch(
  queryPrompt: string,
  _fullPrompt: string,
  outputs: AgentOutputs,
  signal?: AbortSignal,
): Promise<ProviderResult> {
  const queries = generateEntitySearchQueries(queryPrompt);
  const { category, location } = parseCategoryLocation(queryPrompt);

  const batch = await runPerplexityEntitySearch(queries, signal, 5);
  const outcome = validateAndExtractEntities(
    batch.results,
    category,
    location,
  );

  const content = [
    buildCouncilContextSection(outputs),
    formatEntitySearchReport(
      outcome,
      batch.results.length,
      batch.searchRequestCount,
    ),
  ].join("\n");

  const citations = [
    ...new Set(outcome.candidates.map((c) => c.source_url).filter(Boolean)),
  ];

  return buildSearchApiProviderResult(
    content,
    citations,
    batch.searchRequestCount,
    "entity_search",
  );
}

export async function runResearchAgent(
  workflow: WorkflowDefinition,
  fullPrompt: string,
  outputs: AgentOutputs,
  maxOutputTokens: number,
  signal?: AbortSignal,
  entitySearchPrompt?: string,
): Promise<ProviderResult> {
  const mode = detectResearchMode(fullPrompt, workflow.id);
  const agentDef = workflow.agents.research;

  if (mode === "entity_search") {
    return runEntitySearchResearch(
      entitySearchPrompt ?? fullPrompt,
      fullPrompt,
      outputs,
      signal,
    );
  }

  const userPrompt = buildSonarUserPrompt(fullPrompt, outputs);

  const result = await callPerplexity(
    agentDef.systemPrompt,
    userPrompt,
    signal,
    undefined,
    maxOutputTokens,
  );

  return {
    ...result,
    researchMeta: {
      mode,
      provider: "Perplexity Sonar",
    },
  };
}
