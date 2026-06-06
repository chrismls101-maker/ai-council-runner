/**
 * Live caption translation via IIVO server POST /api/glass/translate.
 */

import type { GlassConfig } from "../shared/config.ts";
import type { LiveTranslateLanguage, LiveTranslateTargetLanguage } from "../shared/liveTranslateTypes.ts";

export interface TranslateViaServerRequest {
  text: string;
  sourceLanguage: LiveTranslateLanguage;
  targetLanguage: LiveTranslateTargetLanguage;
  interim?: boolean;
}

export interface TranslateViaServerResult {
  translated: string;
  modelUsed?: string;
  alreadyTargetLanguage?: boolean;
}

export function buildGlassTranslateUrl(config: GlassConfig): string {
  return `${config.iivoApiUrl}/api/glass/translate`;
}

export async function translateViaServer(
  config: GlassConfig,
  request: TranslateViaServerRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<TranslateViaServerResult> {
  let res: Response;
  try {
    res = await fetchImpl(buildGlassTranslateUrl(config), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: request.text,
        sourceLanguage: request.sourceLanguage === "auto" ? undefined : request.sourceLanguage,
        targetLanguage: request.targetLanguage,
        interim: request.interim === true,
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new Error("Translation server unavailable.");
  }

  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    translated?: string;
    modelUsed?: string;
    alreadyTargetLanguage?: boolean;
  };

  if (!res.ok) {
    throw new Error(body.error ?? `Translation failed (${res.status})`);
  }

  const translated = body.translated?.trim();
  if (!translated) {
    throw new Error("Empty translation from server.");
  }

  return {
    translated,
    modelUsed: body.modelUsed,
    alreadyTargetLanguage: body.alreadyTargetLanguage,
  };
}
