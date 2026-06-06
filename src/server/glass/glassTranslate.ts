/**
 * IIVO Glass — live caption translation via OpenAI (fast, no Council).
 */

import { callOpenAIWithModelChain } from "../providers/openai.js";
import { buildGlassModelTryChain, resolveGlassModelPrimary } from "../config/glassModels.js";

export interface GlassTranslateRequestBody {
  text: string;
  sourceLanguage?: string;
  targetLanguage: string;
  interim?: boolean;
}

export interface GlassTranslateResponseBody {
  translated: string;
  modelUsed: string;
  detectedSourceLanguage?: string;
  alreadyTargetLanguage?: boolean;
}

export async function translateLiveCaption(
  body: GlassTranslateRequestBody,
): Promise<GlassTranslateResponseBody> {
  const text = body.text?.trim();
  if (!text || text.length < 4) {
    throw new Error("Caption text too short to translate.");
  }

  const target = body.targetLanguage?.trim() || "en";
  const source = body.sourceLanguage?.trim() || "auto";
  const system = `You translate live speech captions from ${source === "auto" ? "the detected source language" : source} to ${target}. Return ONLY the translated text — no quotes, labels, or commentary. Keep names and numbers. Be natural and concise for subtitles.${
    body.interim ? " The input may be a partial phrase — translate naturally without inventing missing words." : ""
  }`;

  const primary = resolveGlassModelPrimary("text", "default");
  const chain = buildGlassModelTryChain(primary);
  const result = await callOpenAIWithModelChain(system, text, chain, undefined, 280);

  const translated = result.content?.trim();
  if (!translated) {
    throw new Error("Empty translation response.");
  }

  const alreadyTargetLanguage =
    translated.toLowerCase() === text.toLowerCase() ||
    /^(\[already|already in)/i.test(translated);

  return {
    translated: alreadyTargetLanguage ? text : translated,
    modelUsed: result.modelUsed,
    alreadyTargetLanguage,
  };
}
