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
        "openai",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function getOpenAiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new ProviderError(
      "OPENAI_API_KEY is not configured. Add it to your .env file.",
      "openai",
    );
  }
  return key;
}

function parseOpenAiUsage(data: {
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

export async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
  model: string = MODELS.openai.gpt4o,
  maxOutputTokens?: number,
): Promise<ProviderResult> {
  const apiKey = getOpenAiKey();

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
  };
  if (maxOutputTokens != null) {
    body.max_tokens = maxOutputTokens;
  }

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
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
      `OpenAI API error (${response.status}): ${sanitizeError(body)}`,
      "openai",
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new ProviderError("OpenAI returned an empty response.", "openai");
  }

  return {
    content,
    provider: "openai",
    model,
    usage: parseOpenAiUsage(data),
  };
}

export type OpenAIUserContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export async function callOpenAIVision(
  systemPrompt: string,
  userText: string,
  imageDataUrl: string,
  signal?: AbortSignal,
  model: string = MODELS.openai.gpt4o,
  maxOutputTokens?: number,
): Promise<ProviderResult> {
  const apiKey = getOpenAiKey();

  const userContent: OpenAIUserContentPart[] = [
    { type: "text", text: userText },
    { type: "image_url", image_url: { url: imageDataUrl, detail: "auto" } },
  ];

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.4,
  };
  if (maxOutputTokens != null) {
    body.max_tokens = maxOutputTokens;
  }

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
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
    const bodyText = await response.text();
    throw new ProviderError(
      `OpenAI vision API error (${response.status}): ${sanitizeError(bodyText)}`,
      "openai",
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new ProviderError("OpenAI vision returned an empty response.", "openai");
  }

  return {
    content,
    provider: "openai",
    model,
    usage: parseOpenAiUsage(data),
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

export function validateOpenAiKey(): string | null {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return "OPENAI_API_KEY is missing";
  }
  return null;
}
