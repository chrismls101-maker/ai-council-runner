/**
 * OpenAI API key format + live validation (main process only).
 */

import { isOpenAiKeyFormatValid } from "../shared/openaiKeyFormat.ts";

export type OpenAiKeyValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/** Live check via OpenAI models list (minimal cost). */
export async function validateOpenAiApiKeyLive(
  apiKey: string,
): Promise<OpenAiKeyValidationResult> {
  const trimmed = apiKey.trim();
  if (!isOpenAiKeyFormatValid(trimmed)) {
    return { ok: false, error: "OpenAI keys start with sk-" };
  }
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${trimmed}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Key not recognized — check it and try again" };
    }
    return { ok: false, error: `Key not recognized (${res.status})` };
  } catch {
    return { ok: false, error: "Could not reach OpenAI — check your connection" };
  }
}
