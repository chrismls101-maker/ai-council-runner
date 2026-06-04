/**
 * IIVO Glass direct ask handler — builds context, runs IIVO, formats overlay answers.
 */

import { runCouncilFull, validateApiKeys } from "../orchestrator/runCouncil.js";
import { InsufficientCreditsError } from "../usage/types.js";
import type { CouncilRunResult } from "../types/index.js";
import type {
  GlassAskMode,
  GlassAskRequestBody,
  GlassAskResponseBody,
  GlassAskSessionPayload,
} from "./glassAskTypes.js";

const COUNCIL_SIGNAL =
  /\b(analyze|analysis|council|strategic decision|deep analysis|strategy for|decision between|tradeoff|go-to-market|\bgtm\b|product decision)\b/i;

const OVERLAY_INSTRUCTION = [
  "Respond for a small desktop overlay card.",
  "Use 3–7 concise bullet points when helpful.",
  "Do not use markdown headers (##) or open with 'Final Action Plan' unless essential.",
  "Keep the answer scannable and under ~700 words.",
].join(" ");

export function resolveGlassAskMode(
  prompt: string,
  requested?: GlassAskMode,
): GlassAskMode {
  if (requested === "council") return "council";
  if (requested === "quick") return "quick";
  if (COUNCIL_SIGNAL.test(prompt)) return "council";
  return "quick";
}

export function buildGlassAskPrompt(prompt: string, session?: GlassAskSessionPayload): string {
  const lines: string[] = [prompt.trim(), "", OVERLAY_INSTRUCTION];
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
  return lines.join("\n");
}

export function buildGlassAskExternalContext(
  session?: GlassAskSessionPayload,
): { items: Array<{ id: string; type: "pasted_text"; title: string; contentText: string; savedToLibrary: false }> } | undefined {
  if (!session?.recentEvents?.length && !session?.summary) return undefined;
  const parts: string[] = [];
  if (session.summary?.trim()) parts.push(`Summary:\n${session.summary.trim()}`);
  for (const event of (session.recentEvents ?? []).slice(-8)) {
    const when = event.timestamp ? new Date(event.timestamp).toLocaleString() : "";
    const src = event.sourceTitle ? ` (${event.sourceTitle})` : "";
    parts.push(`[${event.kind}${src}${when ? ` · ${when}` : ""}] ${event.title}${event.text ? `\n${event.text}` : ""}`);
  }
  if (parts.length === 0) return undefined;
  return {
    items: [
      {
        id: session.sessionId ?? "glass-session",
        type: "pasted_text",
        title: session.title ?? "IIVO Glass session context",
        contentText: parts.join("\n\n"),
        savedToLibrary: false,
      },
    ],
  };
}

/** Strip markdown headers and normalize whitespace for overlay cards. */
export function formatGlassOverlayAnswer(raw: string): {
  display: string;
  full: string;
  truncated: boolean;
} {
  const full = raw
    .trim()
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*Final Action Plan\*\*/gi, "Summary")
    .replace(/\n{3,}/g, "\n\n");

  const lines = full.split("\n");
  const bulletLines = lines.filter((l) => /^\s*[-*•]\s/.test(l));
  let display = full;

  if (bulletLines.length > 7) {
    const kept: string[] = [];
    let bullets = 0;
    for (const line of lines) {
      if (/^\s*[-*•]\s/.test(line)) {
        if (bullets >= 7) continue;
        bullets += 1;
      }
      kept.push(line);
    }
    display = `${kept.join("\n").trim()}\n\n… Open in IIVO for the full answer.`;
  } else if (full.length > 900) {
    display = `${full.slice(0, 880).trim()}…\n\nOpen in IIVO for the full answer.`;
  }

  return {
    display: display.trim(),
    full,
    truncated: display !== full,
  };
}

export function extractGlassAskAnswer(result: CouncilRunResult): string {
  const fromJudge = result.outputs?.finalJudge?.trim();
  if (fromJudge) return fromJudge;
  const fromStrategy = result.outputs?.strategy?.trim();
  if (fromStrategy) return fromStrategy;
  const fromBenchmark = result.benchmarkAnswer?.trim();
  if (fromBenchmark) return fromBenchmark;
  return "";
}

export async function handleGlassAsk(body: GlassAskRequestBody): Promise<GlassAskResponseBody> {
  const prompt = body.prompt?.trim();
  if (!prompt) {
    throw new GlassAskValidationError("prompt is required");
  }

  const missing = validateApiKeys();
  if (missing.length > 0) {
    throw new GlassAskServiceError(
      `Missing API keys: ${missing.join(", ")}. Add them to your .env file.`,
      503,
    );
  }

  const modeUsed = resolveGlassAskMode(prompt, body.mode);
  const executionMode = modeUsed === "council" ? "council" : "quick";
  const fullPrompt = buildGlassAskPrompt(prompt, body.session);
  const externalContext = buildGlassAskExternalContext(body.session);

  const result = await runCouncilFull({
    prompt: fullPrompt,
    preset: "none",
    workflowInput: "auto",
    executionMode,
    executionModeConfirmationAccepted: true,
    executionModeConfirmationShown: true,
    externalContext,
  });

  const rawAnswer = extractGlassAskAnswer(result);
  if (!rawAnswer) {
    const errMsg = result.errors?.[0]?.message ?? "IIVO returned an empty answer.";
    throw new GlassAskServiceError(errMsg, 502);
  }

  const formatted = formatGlassOverlayAnswer(rawAnswer);
  const title =
    prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt;

  return {
    answer: formatted.display,
    modeUsed,
    runId: result.runId,
    title,
    warnings: formatted.truncated
      ? ["Answer truncated for overlay display. Open in IIVO for the full response."]
      : undefined,
    usage: result.usage,
  };
}

export class GlassAskValidationError extends Error {
  readonly status = 400;
}

export class GlassAskServiceError extends Error {
  readonly status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export function insufficientCreditsPayload(err: InsufficientCreditsError) {
  return {
    error: err.message,
    code: err.code,
    requiredCredits: err.requiredCredits,
    currentCredits: err.currentCredits,
  };
}
