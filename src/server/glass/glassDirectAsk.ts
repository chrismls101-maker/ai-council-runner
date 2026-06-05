/**
 * IIVO Glass direct assistant — single OpenAI call, no Council/router.
 */

import { GLASS_MODEL_FALLBACK, resolveGlassModelPrimary, type GlassModelPurpose } from "../config/glassModels.js";
import { callOpenAIWithFallback, ProviderError } from "../providers/openai.js";
import type { GlassAskRequestBody, GlassAskResponseBody, GlassAskSessionPayload } from "./glassAskTypes.js";

export const GLASS_DIRECT_SYSTEM_PROMPT = `You are IIVO Glass, a fast conversational AI companion over the user's workspace. Answer naturally and directly, like ChatGPT. Use the provided session context only when relevant. Be concise unless the user asks for depth. Do not invent screen/audio details you were not given. Do not use council/report formatting.

If the user asks for deep analysis, strategic council review, or multi-agent deliberation, briefly answer what you can and suggest they use Analyze Now in IIVO Glass for a deeper session analysis. Do not switch into council mode yourself.

Style:
- 1–5 short paragraphs or bullets
- conversational and practical
- no heavy markdown, no ## headers
- no Final Action Plan, Decision Quality, Risk Flags, Recommended Action, Score, Sales Attack, Product Decision, or agent/council language`;

const COUNCIL_FORMAT_MARKERS =
  /\b(Final Action Plan|Decision Quality|Risk Flags|Recommended Action|Sales Attack|Product Decision|Final Judge|Strategist complete)\b/i;

export type GlassDirectAskCaller = (
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
  purpose?: GlassModelPurpose,
) => Promise<import("../providers/openai.js").OpenAICallWithFallbackResult>;

const defaultCaller: GlassDirectAskCaller = (system, user, signal, purpose = "default") => {
  const primary = resolveGlassModelPrimary("text", purpose);
  return callOpenAIWithFallback(system, user, primary, signal, GLASS_MODEL_FALLBACK, 900);
};

export function buildGlassDirectUserPrompt(
  prompt: string,
  session?: GlassAskSessionPayload,
): string {
  const lines: string[] = [prompt.trim()];

  if (session?.summary?.trim()) {
    lines.push("", "Session summary:", session.summary.trim());
  }
  if (session?.recentTranscript?.trim()) {
    lines.push("", "Recent transcript:", session.recentTranscript.trim().slice(-1500));
  }
  if (session?.currentSource) {
    const src = [session.currentSource.appName, session.currentSource.windowTitle, session.currentSource.sourceTitle]
      .filter(Boolean)
      .join(" — ");
    if (src) lines.push("", "Active source:", src);
  }
  if (session?.recentInsights?.length) {
    lines.push("", "Recent insights:", session.recentInsights.slice(0, 5).join("\n"));
  }
  if (session?.recentEvents?.length) {
    lines.push("", "Recent session events:");
    for (const event of session.recentEvents.slice(-8)) {
      const when = event.timestamp ? new Date(event.timestamp).toLocaleString() : "";
      const src = event.sourceTitle ? ` (${event.sourceTitle})` : "";
      lines.push(
        `- [${event.kind}${src}${when ? ` · ${when}` : ""}] ${event.title}${event.text ? `: ${event.text}` : ""}`,
      );
    }
  }

  return lines.join("\n");
}

/** Strip council-style formatting and cap overlay length. */
export function formatGlassDirectAnswer(raw: string): {
  answer: string;
  shortAnswer?: string;
  warnings?: string[];
} {
  const cleaned = raw
    .trim()
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(Final Action Plan|Decision Quality|Risk Flags|Recommended Action)\*\*/gi, "")
    .replace(/\n{3,}/g, "\n\n");

  const warnings: string[] = [];
  if (COUNCIL_FORMAT_MARKERS.test(cleaned)) {
    warnings.push("Answer cleaned of council-style formatting for overlay display.");
  }

  const withoutCouncilLines = cleaned
    .split("\n")
    .filter((line) => !COUNCIL_FORMAT_MARKERS.test(line))
    .join("\n")
    .trim();

  const full = withoutCouncilLines || cleaned;
  const overlayCap = 720;

  if (full.length <= overlayCap) {
    return { answer: full, warnings: warnings.length ? warnings : undefined };
  }

  const short = `${full.slice(0, overlayCap).trim()}…`;
  return {
    answer: short,
    shortAnswer: short,
    warnings: ["Answer shortened for overlay.", ...(warnings.length ? warnings : [])],
  };
}

export function validateGlassDirectApiKey(): string[] {
  return process.env.OPENAI_API_KEY?.trim() ? [] : ["OPENAI_API_KEY"];
}

export async function runGlassDirectAsk(
  body: GlassAskRequestBody,
  signal?: AbortSignal,
  caller: GlassDirectAskCaller = defaultCaller,
): Promise<GlassAskResponseBody> {
  const prompt = body.prompt?.trim();
  if (!prompt) {
    throw new Error("prompt is required");
  }

  const purpose = body.modelPurpose ?? "default";
  const userPrompt = buildGlassDirectUserPrompt(prompt, body.session);
  const result = await caller(GLASS_DIRECT_SYSTEM_PROMPT, userPrompt, signal, purpose);
  const formatted = formatGlassDirectAnswer(result.content);

  const title = prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt;

  return {
    answer: formatted.answer,
    shortAnswer: formatted.shortAnswer,
    model: result.model,
    modelRequested: result.requestedModel,
    modelUsed: result.model,
    fallbackUsed: result.fallbackUsed,
    routeUsed: "glass_direct",
    title,
    warnings: formatted.warnings,
    usage: result.usage,
  };
}

export { ProviderError };
