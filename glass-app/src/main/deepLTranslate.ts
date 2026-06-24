/**
 * DeepL translation client for Glass live captions.
 * Used when DEEPL_API_KEY is set — ~50–150 ms latency vs ~500–800 ms for GPT.
 * Falls back to the IIVO server translate endpoint if key is absent.
 *
 * DeepL language codes differ slightly from IIVO's internal codes.
 * Free tier: https://api-free.deepl.com  |  Pro: https://api.deepl.com
 */

import type { LiveTranslateLanguage, LiveTranslateTargetLanguage } from "../shared/liveTranslateTypes.ts";

/** Map IIVO language codes → DeepL target language codes. */
const DEEPL_TARGET_LANG: Partial<Record<LiveTranslateTargetLanguage, string>> = {
  en: "EN-US",
  es: "ES",
  pt: "PT-BR",
  fr: "FR",
  de: "DE",
  it: "IT",
};

/** Map IIVO language codes → DeepL source language codes (optional hint). */
const DEEPL_SOURCE_LANG: Partial<Record<LiveTranslateLanguage, string>> = {
  en: "EN",
  es: "ES",
  pt: "PT",
  fr: "FR",
  de: "DE",
  it: "IT",
};

export interface DeepLTranslateResult {
  translated: string;
  detectedSourceLanguage?: string;
}

/**
 * Translate text via DeepL.
 * Throws on network error or non-2xx response so callers can fall back.
 */
export async function translateViaDeepL(
  apiKey: string,
  text: string,
  targetLanguage: LiveTranslateTargetLanguage,
  sourceLanguage?: LiveTranslateLanguage,
  fetchImpl: typeof fetch = fetch,
): Promise<DeepLTranslateResult> {
  const targetCode = DEEPL_TARGET_LANG[targetLanguage];
  if (!targetCode) {
    throw new Error(`DeepL: unsupported target language "${targetLanguage}"`);
  }

  const sourceCode =
    sourceLanguage && sourceLanguage !== "auto" && sourceLanguage !== "other"
      ? DEEPL_SOURCE_LANG[sourceLanguage]
      : undefined;

  // DeepL free tier uses api-free.deepl.com; pro uses api.deepl.com
  const baseUrl = apiKey.endsWith(":fx")
    ? "https://api-free.deepl.com"
    : "https://api.deepl.com";

  const body: Record<string, unknown> = {
    text: [text],
    target_lang: targetCode,
  };
  if (sourceCode) body.source_lang = sourceCode;

  const res = await fetchImpl(`${baseUrl}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`DeepL ${res.status}: ${detail.slice(0, 120)}`);
  }

  const data = (await res.json()) as {
    translations: Array<{ text: string; detected_source_language?: string }>;
  };

  const first = data.translations[0];
  if (!first?.text) throw new Error("DeepL returned empty translation");

  return {
    translated: first.text,
    detectedSourceLanguage: first.detected_source_language?.toLowerCase(),
  };
}
