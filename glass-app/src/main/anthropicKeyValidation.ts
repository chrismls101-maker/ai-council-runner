/**
 * Anthropic API key format + live validation (main process only).
 */

import Anthropic from "@anthropic-ai/sdk";

import { ANTHROPIC_KEY_FORMAT, isAnthropicKeyFormatValid } from "../shared/anthropicKeyFormat.ts";

const VALIDATION_MODEL = "claude-haiku-4-5-20251001";

export type AnthropicKeyValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/** Cheapest live check — one token via Messages API. */
export async function validateAnthropicApiKeyLive(
  apiKey: string,
): Promise<AnthropicKeyValidationResult> {
  const trimmed = apiKey.trim();
  if (!isAnthropicKeyFormatValid(trimmed)) {
    return { ok: false, error: "That doesn't look like a valid Anthropic key — it should start with sk-ant-" };
  }
  try {
    const client = new Anthropic({ apiKey: trimmed });
    await client.messages.create({
      model: VALIDATION_MODEL,
      max_tokens: 1,
      messages: [{ role: "user", content: "." }],
    });
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Anthropic couldn't verify this key. Check that it's active in your console.",
    };
  }
}
