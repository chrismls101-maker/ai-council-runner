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
import {
  buildGlassAskSystemPrompt,
  buildGlassAskUserText,
  extractGlassAskImage,
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
  return new Anthropic({ apiKey });
}

function buildMessageContent(
  request: GlassAskRequest,
): Anthropic.MessageParam["content"] {
  const image = extractGlassAskImage(request);
  const text = buildGlassAskUserText(request);
  if (!image) return text;
  return [image, { type: "text", text }];
}

function buildGlassAskResponse(
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

  const usedVision = Boolean(request.visualIntent || request.latestScreenshot);
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
  const model = resolveGlassAnthropicModel(request.modelPurpose ?? "default");
  const maxTokens = request.responseStyle === "full" ? 8192 : 1024;

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: buildGlassAskSystemPrompt(request),
    messages: [{ role: "user", content: buildMessageContent(request) }],
  }, { signal });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return buildGlassAskResponse(request, model, text);
}

export async function askGlassAnthropicStream(
  request: GlassAskRequest,
  onToken: (partial: string) => void,
  signal?: AbortSignal,
): Promise<GlassAskResponse> {
  if (signal?.aborted) throw new Error("Glass ask cancelled");

  const client = createAnthropicClient();
  const model = resolveGlassAnthropicModel(request.modelPurpose ?? "default");
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

  await stream.finalMessage();

  if (signal?.aborted) throw new Error("Glass ask cancelled");

  return buildGlassAskResponse(request, model, accumulated);
}

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

/** Fast/cheap Anthropic call for memory extraction and summarization. */
export async function askAnthropicHaiku(system: string, user: string): Promise<string> {
  const client = createAnthropicClient();
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: user }],
  });
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}
