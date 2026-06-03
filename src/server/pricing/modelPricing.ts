import type { PerplexitySearchContext } from "../config/perplexity.js";

export interface ModelPricing {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  /** ISO date when rates were last verified against provider docs */
  asOf: string;
  notes?: string;
  /** Perplexity Sonar only — flat USD per completed request */
  requestFeeUsd?: number;
  requestFeeLabel?: string;
  searchContextSize?: PerplexitySearchContext;
}

/**
 * Manual pricing table — update when providers change rates.
 * Sources (verified 2026-05-31):
 * - OpenAI: https://developers.openai.com/api/docs/pricing
 * - Anthropic: https://docs.anthropic.com/en/docs/about-claude/models
 * - Perplexity: https://docs.perplexity.ai/docs/getting-started/pricing
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4o": {
    inputPricePerMillion: 2.5,
    outputPricePerMillion: 10,
    asOf: "2026-05-31",
    notes: "OpenAI standard API rates",
  },
  "claude-sonnet-4-5-20250929": {
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
    asOf: "2026-05-31",
    notes: "Anthropic Claude Sonnet 4.5 standard rates",
  },
  sonar: {
    inputPricePerMillion: 1,
    outputPricePerMillion: 1,
    asOf: "2026-05-31",
    notes: "Perplexity Sonar token + request fees",
    requestFeeUsd: 0.005,
    requestFeeLabel: "Sonar low search context request fee: $5 / 1,000 requests",
    searchContextSize: "low",
  },
  "search-api": {
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
    asOf: "2026-05-31",
    notes: "Perplexity Search API — request fee only, no token cost",
    requestFeeUsd: 0.005,
    requestFeeLabel: "Search API request fee: $5 / 1,000 requests",
  },
};
