/**
 * Local Glass direct ask — Anthropic Messages API (main process).
 * Replaces Railway POST /api/glass/ask for inference.
 */

import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import type { GlassAskRequest, GlassAskResponse } from "../shared/glassAskTypes.ts";
import { isCouncilFormattedAnswer } from "../shared/glassAskTypes.ts";
import {
  resolveAnthropicApiKey,
  resolveGlassAnthropicModel,
} from "./anthropicKeyStore.ts";
import { recordModelCall } from "./modelCallStore.ts";
import {
  buildGlassAskMessageContent,
  buildGlassAskSystemPrompt,
  overlayShortAnswer,
} from "./glassAskPrompt.ts";

export class GlassAskNoAnthropicKeyError extends Error {
  constructor() {
    super(
      "No Anthropic API key found. Add one in Glass Settings → API Keys, or set ANTHROPIC_API_KEY in .env for first-run migration.",
    );
    this.name = "GlassAskNoAnthropicKeyError";
  }
}

function createAnthropicClient(): Anthropic {
  const apiKey = resolveAnthropicApiKey();
  if (!apiKey) throw new GlassAskNoAnthropicKeyError();
  const timeoutMs = Number.parseInt(process.env.ANTHROPIC_TIMEOUT_MS?.trim() ?? "", 10);
  return new Anthropic({
    apiKey,
    ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeout: timeoutMs } : {}),
  });
}

function normalizeAnthropicAskError(err: unknown): Error {
  if (err instanceof GlassAskNoAnthropicKeyError) return err;
  if (err instanceof Error && /cancel/i.test(err.message)) return err;

  const status =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status?: unknown }).status)
      : undefined;

  if (status === 503) {
    return new Error("Anthropic API temporarily unavailable (503).");
  }
  if (status === 529) {
    return new Error("Anthropic API overloaded (529).");
  }
  if (err instanceof Error) {
    if (/timed?\s*out|ETIMEDOUT|AbortError/i.test(err.message)) {
      return new Error("This is taking longer than expected. You can cancel and try again.");
    }
    return err;
  }
  return new Error(String(err));
}

function buildMessageContent(
  request: GlassAskRequest,
): Anthropic.MessageParam["content"] {
  return buildGlassAskMessageContent(request);
}

export function buildGlassAskResponse(
  request: GlassAskRequest,
  model: string,
  answer: string,
): GlassAskResponse {
  const trimmed = answer.trim();
  if (!trimmed) {
    throw new Error("Anthropic returned an empty answer.");
  }
  if (isCouncilFormattedAnswer(trimmed)) {
    throw new Error("Model returned council-formatted output — retry or rephrase your question.");
  }

  const usedVision = Boolean(
    request.visualIntent
    || request.latestScreenshot
    || (request.videoWatchBuffer?.frames.length ?? 0) > 0,
  );
  return {
    answer: trimmed,
    shortAnswer: request.responseStyle === "overlay" ? overlayShortAnswer(trimmed) : undefined,
    model,
    modelUsed: model,
    modelRequested: model,
    fallbackUsed: false,
    routeUsed: usedVision ? "glass_visual_direct" : "glass_direct",
    usedVision,
    runId: randomUUID(),
  };
}

export async function askGlassAnthropic(
  request: GlassAskRequest,
  signal?: AbortSignal,
): Promise<GlassAskResponse> {
  if (signal?.aborted) throw new Error("Glass ask cancelled");

  const client = createAnthropicClient();
  const model = request.anthropicModel?.trim()
    || resolveGlassAnthropicModel(request.modelPurpose ?? "default");
  const maxTokens = request.responseStyle === "full" ? 8192 : 1024;

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: buildGlassAskSystemPrompt(request),
    messages: [{ role: "user", content: buildMessageContent(request) }],
  }, { signal }).catch((err: unknown) => {
    throw normalizeAnthropicAskError(err);
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  recordAskUsage(response, request, model, "ask");

  return buildGlassAskResponse(request, model, text);
}

function recordAskUsage(
  response: Anthropic.Message,
  request: GlassAskRequest,
  model: string,
  source: "ask" | "ask_stream",
): void {
  const input = response.usage?.input_tokens ?? 0;
  const output = response.usage?.output_tokens ?? 0;
  if (input === 0 && output === 0) return;
  recordModelCall({
    sessionId: request.session?.sessionId,
    source: request.modelCallSource ?? source,
    provider: "anthropic",
    model,
    inputTokens: input,
    outputTokens: output,
  });
}

export async function askGlassAnthropicStream(
  request: GlassAskRequest,
  onToken: (partial: string) => void,
  signal?: AbortSignal,
): Promise<GlassAskResponse> {
  if (signal?.aborted) throw new Error("Glass ask cancelled");

  const client = createAnthropicClient();
  const model = request.anthropicModel?.trim()
    || resolveGlassAnthropicModel(request.modelPurpose ?? "default");
  const maxTokens = request.responseStyle === "full" ? 8192 : 1024;

  let accumulated = "";

  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: buildGlassAskSystemPrompt(request),
    messages: [{ role: "user", content: buildMessageContent(request) }],
  }, { signal });

  stream.on("text", (delta) => {
    accumulated += delta;
    onToken(accumulated);
  });

  try {
    const finalMessage = await stream.finalMessage();
    recordAskUsage(finalMessage, request, model, "ask_stream");
  } catch (err) {
    throw normalizeAnthropicAskError(err);
  }

  if (signal?.aborted) throw new Error("Glass ask cancelled");

  return buildGlassAskResponse(request, model, accumulated);
}

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

/** Fast/cheap Anthropic call for memory extraction and summarization. */
export async function askAnthropicHaiku(
  system: string,
  user: string,
  opts?: { sessionId?: string },
): Promise<string> {
  const client = createAnthropicClient();
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: user }],
  });
  const input = response.usage?.input_tokens ?? 0;
  const output = response.usage?.output_tokens ?? 0;
  if (input > 0 || output > 0) {
    recordModelCall({
      sessionId: opts?.sessionId,
      source: "memory",
      provider: "anthropic",
      model: HAIKU_MODEL,
      agentId: "memory-engine",
      inputTokens: input,
      outputTokens: output,
    });
  }
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

function parseImageDataUrl(dataUrl: string): {
  type: "image";
  source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string };
} | null {
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match?.[1] || !match[2]) return null;
  const media = match[1] as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  return { type: "image", source: { type: "base64", media_type: media, data: match[2] } };
}

/** Haiku vision call for design-to-code structured extraction / verification. */
export async function askAnthropicHaikuVision(
  system: string,
  userText: string,
  imageDataUrl: string,
  opts?: { sessionId?: string; maxTokens?: number },
): Promise<string> {
  const client = createAnthropicClient();
  const imageBlock = parseImageDataUrl(imageDataUrl);
  const content: Anthropic.MessageParam["content"] = imageBlock
    ? [imageBlock, { type: "text", text: userText }]
    : userText;

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: opts?.maxTokens ?? 4096,
    system,
    messages: [{ role: "user", content }],
  });
  const input = response.usage?.input_tokens ?? 0;
  const output = response.usage?.output_tokens ?? 0;
  if (input > 0 || output > 0) {
    recordModelCall({
      sessionId: opts?.sessionId,
      source: "design-to-code",
      provider: "anthropic",
      model: HAIKU_MODEL,
      agentId: "design-to-code",
      inputTokens: input,
      outputTokens: output,
    });
  }
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}
