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

/** Same shape as OpenAICallWithFallbackResult — used by glassDirectAsk.ts. */
export type AnthropicCallWithFallbackResult = ProviderResult & {
  requestedModel: string;
  selectedModel: string;
  modelUsed: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
};

/** Try each model in order; move to next on 4xx model-not-found errors. */
export async function callAnthropicWithModelChain(
  systemPrompt: string,
  userPrompt: string,
  models: string[],
  signal?: AbortSignal,
  maxOutputTokens?: number,
): Promise<AnthropicCallWithFallbackResult> {
  if (models.length === 0) {
    throw new ProviderError("No models provided for Anthropic call.", "anthropic");
  }
  const requestedModel = models[0];
  let lastErr: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const result = await callAnthropic(systemPrompt, userPrompt, signal, model, maxOutputTokens);
      return {
        ...result,
        requestedModel,
        selectedModel: requestedModel,
        modelUsed: result.model,
        fallbackUsed: i > 0,
        fallbackReason:
          i > 0 && lastErr instanceof Error
            ? `${models[i - 1]}: ${lastErr.message.slice(0, 240)}`
            : undefined,
      };
    } catch (err) {
      lastErr = err;
      const isUnavailable =
        err instanceof ProviderError &&
        /404|model_not_found|does not exist/i.test(err.message);
      if (!isUnavailable || i === models.length - 1) throw err;
      console.warn(
        `[glass-models] Anthropic model "${model}" unavailable — trying "${models[i + 1]}"`,
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new ProviderError(String(lastErr), "anthropic");
}

/**
 * Streaming Anthropic call — emits each text token via `onToken`.
 * Uses the Anthropic SSE streaming API.
 */
export async function callAnthropicStreamingWithModelChain(
  systemPrompt: string,
  userPrompt: string,
  models: string[],
  onToken: (token: string) => void,
  signal?: AbortSignal,
  maxOutputTokens?: number,
): Promise<AnthropicCallWithFallbackResult> {
  if (models.length === 0) {
    throw new ProviderError("No models provided for Anthropic streaming call.", "anthropic");
  }
  const requestedModel = models[0];
  let lastErr: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const result = await postAnthropicStream(
        systemPrompt,
        userPrompt,
        model,
        onToken,
        signal,
        maxOutputTokens,
      );
      return {
        content: result.content,
        provider: "anthropic",
        model: result.model,
        usage: result.usage,
        requestedModel,
        selectedModel: requestedModel,
        modelUsed: result.model,
        fallbackUsed: i > 0,
        fallbackReason:
          i > 0 && lastErr instanceof Error
            ? `${models[i - 1]}: ${lastErr.message.slice(0, 240)}`
            : undefined,
      };
    } catch (err) {
      lastErr = err;
      const isUnavailable =
        err instanceof ProviderError &&
        /404|model_not_found|does not exist/i.test(err.message);
      if (!isUnavailable || i === models.length - 1) throw err;
      console.warn(
        `[glass-models] Anthropic streaming model "${model}" unavailable — trying "${models[i + 1]}"`,
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new ProviderError(String(lastErr), "anthropic");
}

async function postAnthropicStream(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  onToken: (token: string) => void,
  signal?: AbortSignal,
  maxOutputTokens?: number,
): Promise<{ content: string; model: string; usage: ProviderUsage }> {
  const apiKey = getAnthropicKey();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
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
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ProviderError(
      `Anthropic API error (${response.status}): ${sanitizeError(body)}`,
      "anthropic",
    );
  }

  if (!response.body) {
    throw new ProviderError("Anthropic returned no response body.", "anthropic");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let resolvedModel = model;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush any remaining bytes in the TextDecoder and process the final buffer.
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(data) as Record<string, unknown>;
        } catch {
          continue;
        }
        const eventType = parsed.type as string | undefined;
        if (eventType === "message_start") {
          const msg = parsed.message as { model?: string; usage?: { input_tokens?: number } } | undefined;
          if (msg?.model) resolvedModel = msg.model;
          if (msg?.usage?.input_tokens != null) inputTokens = msg.usage.input_tokens;
        } else if (eventType === "content_block_delta") {
          const delta = (parsed.delta as { type?: string; text?: string } | undefined);
          if (delta?.type === "text_delta" && delta.text) {
            accumulated += delta.text;
            onToken(delta.text);
          }
        } else if (eventType === "message_delta") {
          const usage = (parsed.usage as { output_tokens?: number } | undefined);
          if (usage?.output_tokens != null) outputTokens = usage.output_tokens;
        }
      }
    }
    // Process any remainder left in the buffer after the final flush.
    if (buffer.trim()) {
      const lines = buffer.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(data) as Record<string, unknown>; } catch { continue; }
        const eventType = parsed.type as string | undefined;
        if (eventType === "content_block_delta") {
          const delta = parsed.delta as { type?: string; text?: string } | undefined;
          if (delta?.type === "text_delta" && delta.text) {
            accumulated += delta.text;
            onToken(delta.text);
          }
        } else if (eventType === "message_delta") {
          const usage = parsed.usage as { output_tokens?: number } | undefined;
          if (usage?.output_tokens != null) outputTokens = usage.output_tokens;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!accumulated.trim()) {
    throw new ProviderError("Anthropic stream returned empty content.", "anthropic");
  }

  const total = inputTokens != null && outputTokens != null ? inputTokens + outputTokens : null;
  return {
    content: accumulated.trim(),
    model: resolvedModel,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: total,
      usageAvailable: inputTokens != null && outputTokens != null,
    },
  };
}
