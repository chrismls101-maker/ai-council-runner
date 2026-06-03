import type { AgentId } from "../types/index.js";

export type ProviderName = "openai" | "anthropic" | "perplexity";

export const MODELS = {
  openai: {
    gpt4o: "gpt-4o",
  },
  anthropic: {
    claudeSonnet4: "claude-sonnet-4-5-20250929",
  },
  perplexity: {
    sonar: "sonar",
  },
} as const;

export const AGENT_MODEL_CONFIG: Record<
  AgentId,
  { provider: ProviderName; model: string }
> = {
  strategy: { provider: "openai", model: MODELS.openai.gpt4o },
  critic: { provider: "anthropic", model: MODELS.anthropic.claudeSonnet4 },
  research: { provider: "perplexity", model: MODELS.perplexity.sonar },
  salesWriter: { provider: "anthropic", model: MODELS.anthropic.claudeSonnet4 },
  finalJudge: { provider: "openai", model: MODELS.openai.gpt4o },
};

export function logConfiguredModels(): void {
  console.log("Configured models:");
  for (const [agent, config] of Object.entries(AGENT_MODEL_CONFIG)) {
    console.log(`  ${agent}: ${config.provider} / ${config.model}`);
  }
}
