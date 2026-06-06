/**
 * IIVO Glass — Live Translate chunk processing (pure).
 * Language heuristics + chunk gating before API translation.
 */

import type { LiveTranslateLanguage, LiveTranslateTargetLanguage } from "./liveTranslateTypes.ts";

const MIN_TRANSLATE_CHARS = 8;
const MIN_FINAL_CHARS = 14;

const LANGUAGE_HINTS: Record<Exclude<LiveTranslateLanguage, "auto" | "other">, RegExp[]> = {
  en: [/\b(the|and|you|that|with|this|have|from|they|what|about)\b/i],
  es: [/\b(el|la|los|las|que|de|en|un|una|por|para|con|está|esto)\b/i, /[áéíóúñ¿¡]/i],
  pt: [/\b(o|a|os|as|que|de|em|um|uma|por|para|com|está|isto)\b/i, /[ãõç]/i],
  fr: [/\b(le|la|les|que|de|en|un|une|pour|avec|est|ce|cette)\b/i, /[àâçéèêëîïôùûü]/i],
  de: [/\b(der|die|das|und|ist|nicht|mit|für|auf|ein|eine)\b/i, /[äöüß]/i],
  it: [/\b(il|la|lo|gli|le|che|di|un|una|per|con|questo|questa)\b/i, /[àèéìòù]/i],
};

export function shouldAttemptTranslation(text: string, interim?: boolean): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < MIN_TRANSLATE_CHARS) return false;
  if (interim && trimmed.length < MIN_FINAL_CHARS && !/[.!?…]$/.test(trimmed)) return false;
  return true;
}

/** Lightweight language detection for caption labeling (not forensic). */
export function detectLanguageHeuristic(text: string): {
  language: LiveTranslateLanguage;
  uncertain: boolean;
} {
  const sample = text.slice(0, 280).toLowerCase();
  const scores: Partial<Record<Exclude<LiveTranslateLanguage, "auto" | "other">, number>> = {};

  for (const [lang, patterns] of Object.entries(LANGUAGE_HINTS) as [
    Exclude<LiveTranslateLanguage, "auto" | "other">,
    RegExp[],
  ][]) {
    let score = 0;
    for (const re of patterns) if (re.test(sample)) score += 1;
    if (score > 0) scores[lang] = score;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { language: "other", uncertain: true };
  const [best, bestScore] = ranked[0]!;
  const secondScore = ranked[1]?.[1] ?? 0;
  return {
    language: best as LiveTranslateLanguage,
    uncertain: bestScore <= 1 || bestScore - secondScore <= 0,
  };
}

export function isAlreadyTargetLanguage(
  detected: LiveTranslateLanguage,
  target: LiveTranslateTargetLanguage,
  configuredSource: LiveTranslateLanguage,
): boolean {
  const resolved = configuredSource !== "auto" ? configuredSource : detected;
  return resolved !== "auto" && resolved !== "other" && resolved === target;
}

export function buildTranslateSystemPrompt(
  sourceLanguage: LiveTranslateLanguage,
  targetLanguage: LiveTranslateTargetLanguage,
): string {
  const from =
    sourceLanguage === "auto"
      ? "the detected source language"
      : sourceLanguage;
  return `You translate live speech captions from ${from} to ${targetLanguage}. Return ONLY the translated text — no quotes, labels, or commentary. Keep names and numbers. Be natural and concise for subtitles.`;
}

export function buildTranslateUserPrompt(text: string, interim?: boolean): string {
  if (interim) {
    return `Partial caption (may be incomplete — translate naturally, do not invent missing words):\n${text}`;
  }
  return text;
}
