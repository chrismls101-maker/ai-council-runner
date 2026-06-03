import { MODELS } from "../config/models.js";
import type { ProviderResult, ProviderUsage } from "./types.js";

const REQUEST_TIMEOUT_MS = 120_000;

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
        "anthropic",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function getAnthropicKey(): string {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new ProviderError(
      "ANTHROPIC_API_KEY is not configured. Add it to your .env file.",
      "anthropic",
    );
  }
  return key;
}

function parseAnthropicUsage(data: {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
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

  const inputTokens = usage.input_tokens ?? null;
  const outputTokens = usage.output_tokens ?? null;
  const totalTokens =
    inputTokens != null && outputTokens != null
      ? inputTokens + outputTokens
      : null;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    usageAvailable: inputTokens != null && outputTokens != null,
  };
}

export async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
  model: string = MODELS.anthropic.claudeSonnet4,
  maxOutputTokens?: number,
): Promise<ProviderResult> {
  const apiKey = getAnthropicKey();

  const response = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxOutputTokens ?? 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal,
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new ProviderError(
      `Anthropic API error (${response.status}): ${sanitizeError(body)}`,
      "anthropic",
    );
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };

  const content = data.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();

  if (!content) {
    throw new ProviderError("Anthropic returned an empty response.", "anthropic");
  }

  return {
    content,
    provider: "anthropic",
    model,
    usage: parseAnthropicUsage(data),
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

export function validateAnthropicKey(): string | null {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return "ANTHROPIC_API_KEY is missing";
  }
  return null;
}
