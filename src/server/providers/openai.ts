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

function usesGpt5ClassParams(model: string): boolean {
  return /^(gpt-5|gpt-5\.|o3|o4-mini|o4)/.test(model);
}

function buildChatCompletionBody(
  model: string,
  messages: unknown[],
  maxOutputTokens: number | undefined,
  temperature: number | undefined,
): Record<string, unknown> {
  const body: Record<string, unknown> = { model, messages };
  if (!usesGpt5ClassParams(model) && temperature != null) {
    body.temperature = temperature;
  }
  if (maxOutputTokens != null) {
    if (usesGpt5ClassParams(model)) {
      body.max_completion_tokens = maxOutputTokens;
    } else {
      body.max_tokens = maxOutputTokens;
    }
  }
  return body;
}

async function postChatCompletion(
  body: Record<string, unknown>,
  signal?: AbortSignal,
  label = "OpenAI",
): Promise<{ content: string; model: string; usage: ProviderUsage }> {
  const apiKey = getOpenAiKey();
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
    const errBody = await response.text();
    throw new ProviderError(
      `${label} API error (${response.status}): ${sanitizeError(errBody)}`,
      "openai",
    );
  }

  const data = (await response.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new ProviderError(`${label} returned an empty response.`, "openai");
  }

  return {
    content,
    model: data.model ?? String(body.model),
    usage: parseOpenAiUsage(data),
  };
}

export async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
  model: string = MODELS.openai.gpt4o,
  maxOutputTokens?: number,
): Promise<ProviderResult> {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
  const result = await postChatCompletion(
    buildChatCompletionBody(model, messages, maxOutputTokens, 0.7),
    signal,
    "OpenAI",
  );
  return {
    content: result.content,
    provider: "openai",
    model: result.model,
    usage: result.usage,
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
  getOpenAiKey();

  const userContent: OpenAIUserContentPart[] = [
    { type: "text", text: userText },
    { type: "image_url", image_url: { url: imageDataUrl, detail: "auto" } },
  ];

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
  const result = await postChatCompletion(
    buildChatCompletionBody(model, messages, maxOutputTokens, 0.4),
    signal,
    "OpenAI vision",
  );

  return {
    content: result.content,
    provider: "openai",
    model: result.model,
    usage: result.usage,
  };
}

function sanitizeError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; code?: string } };
    const code = parsed.error?.code;
    const message = parsed.error?.message ?? body.slice(0, 200);
    return code ? `${code}: ${message}` : message;
  } catch {
    return body.slice(0, 200);
  }
}

/** True when OpenAI rejects the model id (safe to retry with fallback). */
export function isOpenAiModelUnavailableError(err: unknown): boolean {
  if (!(err instanceof ProviderError)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("model_not_found") ||
    msg.includes("does not exist") ||
    msg.includes("model_not_available") ||
    (msg.includes("model") && msg.includes("not found")) ||
    (msg.includes("404") && msg.includes("model"))
  );
}

export type OpenAICallWithFallbackResult = ProviderResult & {
  requestedModel: string;
  selectedModel: string;
  modelUsed: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
};

function fallbackReasonFromError(err: unknown, failedModel: string): string {
  if (err instanceof ProviderError) {
    return `${failedModel}: ${err.message.slice(0, 240)}`;
  }
  return `${failedModel}: ${err instanceof Error ? err.message : String(err)}`;
}

export async function callOpenAIWithModelChain(
  systemPrompt: string,
  userPrompt: string,
  models: string[],
  signal?: AbortSignal,
  maxOutputTokens?: number,
): Promise<OpenAICallWithFallbackResult> {
  if (models.length === 0) {
    throw new ProviderError("No models provided for OpenAI call.", "openai");
  }
  const requestedModel = models[0];
  let lastErr: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const result = await callOpenAI(systemPrompt, userPrompt, signal, model, maxOutputTokens);
      return {
        ...result,
        requestedModel,
        selectedModel: requestedModel,
        modelUsed: result.model,
        fallbackUsed: i > 0,
        fallbackReason:
          i > 0 && lastErr ? fallbackReasonFromError(lastErr, models[i - 1]) : undefined,
      };
    } catch (err) {
      lastErr = err;
      if (!isOpenAiModelUnavailableError(err) || i === models.length - 1) {
        throw err;
      }
      console.warn(
        `[glass-models] OpenAI text model "${model}" unavailable — trying "${models[i + 1]}"`,
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new ProviderError(String(lastErr), "openai");
}

export async function callOpenAIVisionWithModelChain(
  systemPrompt: string,
  userText: string,
  imageDataUrl: string,
  models: string[],
  signal?: AbortSignal,
  maxOutputTokens?: number,
): Promise<OpenAICallWithFallbackResult> {
  if (models.length === 0) {
    throw new ProviderError("No models provided for OpenAI vision call.", "openai");
  }
  const requestedModel = models[0];
  let lastErr: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const result = await callOpenAIVision(
        systemPrompt,
        userText,
        imageDataUrl,
        signal,
        model,
        maxOutputTokens,
      );
      return {
        ...result,
        requestedModel,
        selectedModel: requestedModel,
        modelUsed: result.model,
        fallbackUsed: i > 0,
        fallbackReason:
          i > 0 && lastErr ? fallbackReasonFromError(lastErr, models[i - 1]) : undefined,
      };
    } catch (err) {
      lastErr = err;
      if (!isOpenAiModelUnavailableError(err) || i === models.length - 1) {
        throw err;
      }
      console.warn(
        `[glass-models] OpenAI vision model "${model}" unavailable — trying "${models[i + 1]}"`,
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new ProviderError(String(lastErr), "openai");
}

/** @deprecated use callOpenAIWithModelChain */
export async function callOpenAIWithFallback(
  systemPrompt: string,
  userPrompt: string,
  primaryModel: string,
  signal?: AbortSignal,
  fallbackModel: string = MODELS.openai.gpt4o,
  maxOutputTokens?: number,
): Promise<OpenAICallWithFallbackResult> {
  return callOpenAIWithModelChain(
    systemPrompt,
    userPrompt,
    [primaryModel, fallbackModel].filter((m, i, a) => a.indexOf(m) === i),
    signal,
    maxOutputTokens,
  );
}

/** @deprecated use callOpenAIVisionWithModelChain */
export async function callOpenAIVisionWithFallback(
  systemPrompt: string,
  userText: string,
  imageDataUrl: string,
  primaryModel: string,
  signal?: AbortSignal,
  fallbackModel: string = MODELS.openai.gpt4o,
  maxOutputTokens?: number,
): Promise<OpenAICallWithFallbackResult> {
  return callOpenAIVisionWithModelChain(
    systemPrompt,
    userText,
    imageDataUrl,
    [primaryModel, fallbackModel].filter((m, i, a) => a.indexOf(m) === i),
    signal,
    maxOutputTokens,
  );
}

export function validateOpenAiKey(): string | null {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return "OPENAI_API_KEY is missing";
  }
  return null;
}
