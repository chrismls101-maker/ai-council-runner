import { MODELS } from "../config/models.js";
import { PERPLEXITY_SEARCH_CONTEXT } from "../config/perplexity.js";
import type { ProviderResult, ProviderUsage } from "./types.js";

const REQUEST_TIMEOUT_MS = 180_000;

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
  ) {
    super(message);
    this.name = "ProviderError";
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
    const response = await fetch(url, { ...options, signal });
    return response;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      if (options.signal?.aborted) {
        throw err;
      }
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

function parsePerplexityUsage(data: {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}): ProviderUsage {
  const usage = data.usage;
  if (!usage) {
    return {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      usageAvailable: false,
    };
  }

  const inputTokens = usage.prompt_tokens ?? null;
  const outputTokens = usage.completion_tokens ?? null;
  const totalTokens =
    usage.total_tokens ??
    (inputTokens != null && outputTokens != null
      ? inputTokens + outputTokens
      : null);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    usageAvailable: inputTokens != null && outputTokens != null,
  };
}

export async function callPerplexity(
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
  model: string = MODELS.perplexity.sonar,
  maxOutputTokens?: number,
): Promise<ProviderResult> {
  const apiKey = getPerplexityKey();

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    search_context_size: PERPLEXITY_SEARCH_CONTEXT,
  };
  if (maxOutputTokens != null) {
    body.max_tokens = maxOutputTokens;
  }

  const response = await fetchWithTimeout(
    "https://api.perplexity.ai/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new ProviderError(
      `Perplexity API error (${response.status}): ${sanitizeError(body)}`,
      "perplexity",
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    citations?: string[];
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new ProviderError("Perplexity returned an empty response.", "perplexity");
  }

  const citations = Array.isArray(data.citations)
    ? data.citations.filter((c): c is string => typeof c === "string" && c.length > 0)
    : undefined;

  return {
    content,
    provider: "perplexity",
    model,
    usage: parsePerplexityUsage(data),
    citations: citations?.length ? citations : undefined,
  };
}

function sanitizeError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message ?? body.slice(0, 200);
  } catch {
    return body.slice(0, 200);
  }
}

export function validatePerplexityKey(): string | null {
  if (!process.env.PERPLEXITY_API_KEY?.trim()) {
    return "PERPLEXITY_API_KEY is missing";
  }
  return null;
}
