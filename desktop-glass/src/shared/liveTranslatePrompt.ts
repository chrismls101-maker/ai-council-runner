/**
 * Context-aware Live Translate prompt building (pure — tested + mirrored on server).
 */

import type {
  LiveTranslateCaptionLine,
  LiveTranslateConfig,
  LiveTranslateGlossaryTerm,
  LiveTranslateLanguage,
  LiveTranslateLatencyMode,
  LiveTranslateTargetLanguage,
  LiveTranslateWorkflowMode,
} from "./liveTranslateTypes.ts";

export interface TranslateApiContext {
  text: string;
  sourceLanguage?: LiveTranslateLanguage;
  targetLanguage: LiveTranslateTargetLanguage;
  interim?: boolean;
  mode?: LiveTranslateWorkflowMode;
  latencyMode?: LiveTranslateLatencyMode;
  previousCaptions?: Array<{ original: string; translated: string }>;
  glossaryTerms?: LiveTranslateGlossaryTerm[];
  appContext?: string;
}

export function recentCaptionContext(
  lines: LiveTranslateCaptionLine[],
  max = 4,
): Array<{ original: string; translated: string }> {
  return lines
    .filter((l) => !l.interim && l.translated)
    .slice(-max)
    .map((l) => ({ original: l.original, translated: l.translated }));
}

export function buildTranslateSystemPrompt(ctx: TranslateApiContext): string {
  const target = ctx.targetLanguage;
  const from =
    ctx.sourceLanguage && ctx.sourceLanguage !== "auto"
      ? ctx.sourceLanguage
      : "the detected source language";
  const mode = ctx.mode ?? "media";
  const latency = ctx.latencyMode ?? "balanced";

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

  const glossary = (ctx.glossaryTerms ?? [])
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
    "Preserve names, places, product names, and numbers.",
    modeGuide,
    latencyGuide,
    glossary,
    ctx.interim
      ? "Input may be partial — translate naturally without inventing missing words."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildTranslateUserPrompt(ctx: TranslateApiContext): string {
  const parts: string[] = [];
  if (ctx.appContext?.trim()) {
    parts.push(`Context: ${ctx.appContext.trim()}`);
  }
  if (ctx.previousCaptions?.length) {
    parts.push("Recent captions for consistency:");
    for (const cap of ctx.previousCaptions) {
      parts.push(`- "${cap.original}" → "${cap.translated}"`);
    }
  }
  parts.push(ctx.interim ? `Partial caption:\n${ctx.text}` : ctx.text);
  return parts.join("\n\n");
}

export function applyGlossaryToTranslation(
  text: string,
  terms: LiveTranslateGlossaryTerm[] | undefined,
): string {
  if (!terms?.length) return text;
  let out = text;
  for (const term of terms) {
    if (!term.preserve || !term.source) continue;
    const re = new RegExp(term.source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, term.source);
  }
  return out;
}
