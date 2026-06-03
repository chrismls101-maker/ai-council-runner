export type PerplexitySearchContext = "low" | "medium" | "high";

/** Default Sonar search context for request-fee estimation */
export const PERPLEXITY_SEARCH_CONTEXT: PerplexitySearchContext = "low";

/** USD per request by search context (Sonar only, not Pro Search) */
export const PERPLEXITY_SONAR_REQUEST_FEES: Record<
  PerplexitySearchContext,
  number
> = {
  low: 0.005,
  medium: 0.008,
  high: 0.012,
};

const REQUEST_FEE_RATES_PER_1K: Record<PerplexitySearchContext, number> = {
  low: 5,
  medium: 8,
  high: 12,
};

export function getSonarRequestFeeUsd(
  context: PerplexitySearchContext = PERPLEXITY_SEARCH_CONTEXT,
): number {
  return PERPLEXITY_SONAR_REQUEST_FEES[context];
}

export function getSonarRequestFeeLabel(
  context: PerplexitySearchContext = PERPLEXITY_SEARCH_CONTEXT,
): string {
  const rate = REQUEST_FEE_RATES_PER_1K[context];
  return `Sonar ${context} search context request fee: $${rate} / 1,000 requests`;
}

export function isSonarModel(model: string): boolean {
  return model === "sonar";
}

/** Perplexity Search API — $5 / 1,000 requests (no token cost) */
export const PERPLEXITY_SEARCH_API_REQUEST_FEE_USD = 0.005;

export function getSearchApiRequestFeeLabel(): string {
  return "Search API request fee: $5 / 1,000 requests";
}
