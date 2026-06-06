/**
 * IIVO Glass — live caption translation via OpenAI (fast, no Council).
 */

import { callOpenAIWithModelChain } from "../providers/openai.js";
import { buildGlassModelTryChain, resolveGlassModelPrimary } from "../config/glassModels.js";

export interface GlassTranslatePreviousCaption {
  original: string;
  translated: string;
}

export interface GlassTranslateGlossaryTerm {
  source: string;
  target?: string;
  preserve?: boolean;
}

export interface GlassTranslateRequestBody {
  text: string;
  sourceLanguage?: string;
  targetLanguage: string;
  interim?: boolean;
  mode?: "media" | "conversation";
  latencyMode?: "fast" | "balanced" | "accurate";
  previousCaptions?: GlassTranslatePreviousCaption[];
  glossaryTerms?: GlassTranslateGlossaryTerm[];
  appContext?: string;
}

export interface GlassTranslateResponseBody {
  translated: string;
  modelUsed: string;
  detectedSourceLanguage?: string;
  alreadyTargetLanguage?: boolean;
}

function buildSystemPrompt(body: GlassTranslateRequestBody): string {
  const target = body.targetLanguage?.trim() || "en";
  const source = body.sourceLanguage?.trim() || "auto";
  const from = source === "auto" ? "the detected source language" : source;
  const mode = body.mode ?? "media";
  const latency = body.latencyMode ?? "balanced";

  const modeGuide =
    mode === "conversation"
      ? "Conversation mode: translate naturally for live calls — preserve casual tone, relationship warmth, and idioms. Do not over-formalize."
      : "Media mode: keep captions concise and readable for videos, podcasts, and courses.";

  const latencyGuide =
    latency === "fast"
      ? "Prefer speed — short natural phrasing even if context is partial."
      : latency === "accurate"
        ? "Use fuller context for accuracy, but still return a single caption line."
        : "Balance speed and accuracy — natural subtitle-length output.";

  const glossary = (body.glossaryTerms ?? [])
    .map((t) =>
      t.preserve
        ? `Preserve "${t.source}" unchanged.`
        : t.target
          ? `Translate "${t.source}" as "${t.target}".`
          : "",
    )
    .filter(Boolean)
    .join(" ");

  return [
    `You translate live speech captions from ${from} to ${target}.`,
    "Return ONLY the translated text — no quotes, labels, or commentary.",
    "Preserve names, places, product names such as IIVO, and numbers.",
    modeGuide,
    latencyGuide,
    glossary,
    body.interim
      ? "Input may be partial — translate naturally without inventing missing words."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildUserPrompt(body: GlassTranslateRequestBody): string {
  const parts: string[] = [];
  if (body.appContext?.trim()) {
    parts.push(`Context: ${body.appContext.trim()}`);
  }
  if (body.previousCaptions?.length) {
    parts.push("Recent captions for consistency:");
    for (const cap of body.previousCaptions) {
      parts.push(`- "${cap.original}" → "${cap.translated}"`);
    }
  }
  parts.push(body.interim ? `Partial caption:\n${body.text}` : body.text);
  return parts.join("\n\n");
}

export async function translateLiveCaption(
  body: GlassTranslateRequestBody,
): Promise<GlassTranslateResponseBody> {
  const text = body.text?.trim();
  if (!text || text.length < 4) {
    throw new Error("Caption text too short to translate.");
  }

  const system = buildSystemPrompt(body);
  const user = buildUserPrompt(body);

  const primary = resolveGlassModelPrimary("text", "default");
  const chain = buildGlassModelTryChain(primary);
  const maxTokens = body.latencyMode === "accurate" ? 360 : 280;
  const result = await callOpenAIWithModelChain(system, user, chain, undefined, maxTokens);

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

/** Exported for unit tests. */
export { buildSystemPrompt, buildUserPrompt };
