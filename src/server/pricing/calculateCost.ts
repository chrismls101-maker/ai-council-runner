import type { AgentId } from "../types/index.js";
import {
  getSonarRequestFeeLabel,
  getSonarRequestFeeUsd,
  getSearchApiRequestFeeLabel,
  isSonarModel,
  PERPLEXITY_SEARCH_CONTEXT,
  PERPLEXITY_SEARCH_API_REQUEST_FEE_USD,
} from "../config/perplexity.js";
import {
  AGENT_LABELS,
  AGENT_ORDER,
  type AgentCost,
  type PricingUsed,
  type RunCostSummary,
} from "../types/index.js";
import { MODEL_PRICING } from "./modelPricing.js";

function calculateTokenCostUsd(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  if (inputTokens == null || outputTokens == null) {
    return null;
  }

  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    return null;
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPricePerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePerMillion;
  return inputCost + outputCost;
}

function buildPricingUsed(
  model: string,
  requestFeeUsd: number,
  searchRequestCount?: number,
): PricingUsed | null {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    return null;
  }

  const base: PricingUsed = {
    inputPricePerMillion: pricing.inputPricePerMillion,
    outputPricePerMillion: pricing.outputPricePerMillion,
    source: "modelPricing.ts",
    asOf: pricing.asOf,
    requestFeeUsd: 0,
  };

  if (model === "search-api") {
    return {
      ...base,
      requestFeeUsd,
      requestFeeLabel:
        searchRequestCount != null
          ? `${getSearchApiRequestFeeLabel()} (${searchRequestCount} request${searchRequestCount === 1 ? "" : "s"})`
          : getSearchApiRequestFeeLabel(),
    };
  }

  if (isSonarModel(model)) {
    return {
      ...base,
      requestFeeUsd,
      requestFeeLabel: getSonarRequestFeeLabel(PERPLEXITY_SEARCH_CONTEXT),
      searchContextSize: PERPLEXITY_SEARCH_CONTEXT,
    };
  }

  return base;
}

export function buildAgentCost(
  provider: string,
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
  totalTokens: number | null,
  usageAvailable: boolean,
  searchRequestCount?: number,
): AgentCost {
  const sonar = isSonarModel(model);
  const isSearchApi = model === "search-api";
  const requestFeeUsd = isSearchApi
    ? (searchRequestCount ?? 1) * PERPLEXITY_SEARCH_API_REQUEST_FEE_USD
    : sonar
      ? getSonarRequestFeeUsd(PERPLEXITY_SEARCH_CONTEXT)
      : 0;
  const tokenCostUsd = isSearchApi
    ? 0
    : calculateTokenCostUsd(model, inputTokens, outputTokens);
  const pricingUsed = buildPricingUsed(model, requestFeeUsd, searchRequestCount);

  let estimatedCostUsd: number | null = null;
  if (isSearchApi || sonar) {
    estimatedCostUsd = (tokenCostUsd ?? 0) + requestFeeUsd;
  } else if (tokenCostUsd != null) {
    estimatedCostUsd = tokenCostUsd;
  }

  return {
    provider,
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    tokenCostUsd: isSearchApi ? 0 : tokenCostUsd,
    requestFeeUsd,
    estimatedCostUsd,
    pricingUsed,
    usageAvailable: isSearchApi ? true : usageAvailable,
    searchRequestCount: isSearchApi ? searchRequestCount : undefined,
  };
}

export function buildRunCostSummary(
  agentCosts: Partial<Record<AgentId, AgentCost>>,
): RunCostSummary {
  const usageUnavailableAgents: AgentId[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokens = 0;
  let totalTokenCostUsd = 0;
  let totalRequestFeesUsd = 0;
  let hasTokenCost = false;
  let hasRequestFees = false;
  let hasAnyEstimatedCost = false;

  const unavailableMessages: string[] = [];

  for (const agentId of AGENT_ORDER) {
    const cost = agentCosts[agentId];
    if (!cost) continue;

    const requestFee = cost.requestFeeUsd ?? 0;
    if (requestFee > 0) {
      totalRequestFeesUsd += requestFee;
      hasRequestFees = true;
      hasAnyEstimatedCost = true;
    }

    if (!cost.usageAvailable) {
      usageUnavailableAgents.push(agentId);
      unavailableMessages.push(
        `Usage unavailable for ${AGENT_LABELS[agentId]} (${cost.provider})`,
      );
      continue;
    }

    totalInputTokens += cost.inputTokens ?? 0;
    totalOutputTokens += cost.outputTokens ?? 0;
    totalTokens += cost.totalTokens ?? 0;

    if (cost.tokenCostUsd != null) {
      totalTokenCostUsd += cost.tokenCostUsd;
      hasTokenCost = true;
      hasAnyEstimatedCost = true;
    }
  }

  const totalEstimatedCostUsd = hasAnyEstimatedCost
    ? totalTokenCostUsd + totalRequestFeesUsd
    : null;

  const warningParts: string[] = [];
  if (usageUnavailableAgents.length > 0) {
    warningParts.push(
      `${unavailableMessages.join(". ")}. Token totals exclude those agents.`,
    );
  }
  if (hasRequestFees) {
    warningParts.push(
      "Perplexity request fees (Sonar + Search API) are estimated from configured rates. Final billing may differ in provider dashboard.",
    );
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    totalTokenCostUsd: hasTokenCost ? totalTokenCostUsd : null,
    totalRequestFeesUsd: hasRequestFees ? totalRequestFeesUsd : 0,
    totalEstimatedCostUsd,
    usageUnavailableAgents,
    warning: warningParts.length > 0 ? warningParts.join(" ") : undefined,
  };
}

export function formatUsd(amount: number | null | undefined): string {
  if (amount == null) return "usage unavailable";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
