import { PERPLEXITY_SEARCH_API_REQUEST_FEE_USD } from "../config/perplexity.js";
import type { ProviderResult, ProviderUsage } from "./types.js";

const REQUEST_TIMEOUT_MS = 60_000;
const SEARCH_API_URL = "https://api.perplexity.ai/search";

export interface PerplexitySearchResult {
  title: string;
  url: string;
  snippet: string;
  domain?: string;
  queryUsed: string;
  date?: string | null;
}

export interface PerplexitySearchBatchResult {
  results: PerplexitySearchResult[];
  searchRequestCount: number;
  searchRequestFeeUsd: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

function getPerplexityKey(): string {
  const key = process.env.PERPLEXITY_API_KEY?.trim();
  if (!key) {
    throw new ProviderError(
      "PERPLEXITY_API_KEY is not configured. Add it to your .env file.",
      "perplexity",
    );
  }
  return key;
}

function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function sanitizeError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message ?? body.slice(0, 200);
  } catch {
    return body.slice(0, 200);
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    return await fetch(url, { ...options, signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      if (options.signal?.aborted) throw err;
      throw new ProviderError(
        `Request timed out after ${timeoutMs / 1000}s`,
        "perplexity",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function callPerplexitySearch(
  query: string,
  signal?: AbortSignal,
  maxResults = 5,
): Promise<PerplexitySearchResult[]> {
  const apiKey = getPerplexityKey();

  const response = await fetchWithTimeout(
    SEARCH_API_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
      }),
      signal,
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new ProviderError(
      `Perplexity Search API error (${response.status}): ${sanitizeError(body)}`,
      "perplexity",
    );
  }

  const data = (await response.json()) as {
    results?: Array<{
      title?: string;
      url?: string;
      snippet?: string;
      date?: string | null;
    }>;
  };

  return (data.results ?? [])
    .filter((r) => r.title && r.url)
    .map((r) => ({
      title: r.title!.trim(),
      url: r.url!.trim(),
      snippet: (r.snippet ?? "").trim(),
      domain: extractDomain(r.url!),
      queryUsed: query,
      date: r.date ?? null,
    }));
}

export async function runPerplexityEntitySearch(
  queries: string[],
  signal?: AbortSignal,
  maxResultsPerQuery = 5,
): Promise<PerplexitySearchBatchResult> {
  const limitedQueries = queries.slice(0, 5);
  const allResults: PerplexitySearchResult[] = [];
  const seenUrls = new Set<string>();

  for (const query of limitedQueries) {
    if (signal?.aborted) {
      throw new DOMException("Run stopped by user.", "AbortError");
    }
    const batch = await callPerplexitySearch(query, signal, maxResultsPerQuery);
    for (const result of batch) {
      const normalized = result.url.toLowerCase();
      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized);
        allResults.push(result);
      }
    }
  }

  const searchRequestCount = limitedQueries.length;
  return {
    results: allResults,
    searchRequestCount,
    searchRequestFeeUsd: searchRequestCount * PERPLEXITY_SEARCH_API_REQUEST_FEE_USD,
  };
}

const NO_TOKEN_USAGE: ProviderUsage = {
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  usageAvailable: false,
};

export function buildSearchApiProviderResult(
  content: string,
  citations: string[],
  searchRequestCount: number,
  mode: string,
): ProviderResult {
  return {
    content,
    provider: "perplexity",
    model: "search-api",
    usage: NO_TOKEN_USAGE,
    citations: citations.length ? citations : undefined,
    researchMeta: {
      mode,
      provider: "Perplexity Search API",
      searchRequestCount,
      searchRequestFeeUsd:
        searchRequestCount * PERPLEXITY_SEARCH_API_REQUEST_FEE_USD,
    },
  };
}
