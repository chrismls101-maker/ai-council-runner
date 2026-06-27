/**
 * Prompt assembly for local Glass direct ask (Anthropic Messages API).
 */

import type { GlassAskRequest } from "../shared/glassAskTypes.ts";
import { formatOverlayAnswerText } from "../shared/glassAskTypes.ts";
import type { HydratedContext } from "../shared/glassMemory.ts";
import { buildSystemPrompt } from "./glassSystemPrompt.ts";

const OVERLAY_SYSTEM = `You are IIVO Glass, a macOS AI overlay assistant embedded in the user's workflow.

Rules:
- Answer directly and practically. No council format, no "Final Judge", no "Decision Quality" sections.
- For overlay mode: start with 1–3 concise sentences the user can read at a glance, then optional brief detail.
- Never mention being an API or model unless asked.
- If you lack information, say so briefly.
- Use markdown sparingly in overlay mode.`;

const FULL_SYSTEM = `You are IIVO Glass, a macOS AI overlay assistant.

Rules:
- Answer thoroughly when full mode is requested.
- No council deliberation format unless the user explicitly asks for a structured decision memo.
- Be specific, actionable, and grounded in the context provided.`;

const VISION_ADDENDUM = `
The user attached a screenshot. Describe what you see when relevant and anchor your answer in visible UI/text.`;

const COMPANION_ADDENDUM = `
Companion mode: the user is navigating software with your help. Be step-oriented and refer to on-screen elements when the uiMap is present.`;

const ONBOARDING_SEED_PREFIX = "User context (Glass calibration — seed, local only):";

/**
 * When memory hydration already injected the SQLite user profile into the system
 * prompt, skip the redundant onboarding seed block from passive context.
 */
export function passiveContextForAsk(
  passiveContext: string | undefined,
  memoryContext: HydratedContext | undefined,
): string | undefined {
  if (!passiveContext?.trim()) return undefined;
  if (!memoryContext?.userProfile?.trim()) return passiveContext.trim();

  if (!passiveContext.includes(ONBOARDING_SEED_PREFIX)) {
    return passiveContext.trim();
  }

  const filtered = passiveContext
    .split(/\n\n+/)
    .filter((part) => !part.trimStart().startsWith(ONBOARDING_SEED_PREFIX))
    .join("\n\n")
    .trim();

  return filtered || undefined;
}

export function buildGlassAskSystemPrompt(request: GlassAskRequest): string {
  const parts = [
    request.responseStyle === "full" ? FULL_SYSTEM : OVERLAY_SYSTEM,
  ];
  if (request.visualIntent || request.latestScreenshot) {
    parts.push(VISION_ADDENDUM);
  }
  if (request.companionMode) {
    parts.push(COMPANION_ADDENDUM);
  }
  if (request.modelPurpose === "diagnostic") {
    parts.push("Diagnostic mode: identify root cause, evidence, and concrete next steps.");
  }
  const base = parts.join("\n");
  if (request.memoryContext && !request.suppressUserProfile) {
    return buildSystemPrompt(base, request.memoryContext);
  }
  return base;
}

function formatSessionBlock(request: GlassAskRequest): string {
  const session = request.session;
  if (!session) return "";

  const lines: string[] = [];
  if (session.title) lines.push(`Session: ${session.title}`);
  if (session.summary) lines.push(`Summary: ${session.summary}`);
  if (session.currentSource?.appName || session.currentSource?.windowTitle) {
    lines.push(
      `Active app: ${session.currentSource.appName ?? "unknown"} — ${session.currentSource.windowTitle ?? ""}`.trim(),
    );
  }
  if (session.recentTranscript?.trim()) {
    lines.push(`Recent transcript:\n${session.recentTranscript.trim().slice(0, 4000)}`);
  }
  if (session.recentInsights?.length) {
    lines.push(`Insights:\n${session.recentInsights.slice(0, 8).join("\n")}`);
  }
  if (session.recentEvents?.length) {
    const events = session.recentEvents
      .slice(-12)
      .map((e) => `- [${e.kind}] ${e.title}${e.text ? `: ${e.text.slice(0, 200)}` : ""}`)
      .join("\n");
    lines.push(`Recent events:\n${events}`);
  }
  return lines.length ? `\n\n--- Session context ---\n${lines.join("\n")}` : "";
}

function formatUserContextBlock(request: GlassAskRequest): string {
  const ctx = request.userContext?.trim();
  return ctx ? `\n\n--- Passive context ---\n${ctx}` : "";
}

function formatCompanionBlock(request: GlassAskRequest): string {
  if (!request.companionMode) return "";
  const parts: string[] = [];
  if (request.companionRoute) {
    parts.push(`Route: ${request.companionRoute}`);
  }
  if (request.companionActivationHint) {
    parts.push(request.companionActivationHint);
  }
  if (request.companionUiMap) {
    parts.push(`UI map marks: ${JSON.stringify(request.companionUiMap).slice(0, 6000)}`);
  }
  if (request.companionMemory) {
    parts.push(`Companion memory: ${JSON.stringify(request.companionMemory).slice(0, 4000)}`);
  }
  return parts.length ? `\n\n--- Companion ---\n${parts.join("\n\n")}` : "";
}

export function buildGlassAskUserText(request: GlassAskRequest): string {
  return [
    request.prompt.trim(),
    formatSessionBlock(request),
    formatUserContextBlock(request),
    formatCompanionBlock(request),
  ].filter(Boolean).join("");
}

export type GlassAskImageBlock = {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
    data: string;
  };
};

export function extractGlassAskImage(
  request: GlassAskRequest,
): GlassAskImageBlock | null {
  const shot = request.latestScreenshot;
  if (!shot) return null;

  const dataUrl = shot.imageDataUrl?.trim();
  if (dataUrl?.startsWith("data:")) {
    const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
    if (match?.[1] && match[2]) {
      const media = match[1] as GlassAskImageBlock["source"]["media_type"];
      return {
        type: "image",
        source: { type: "base64", media_type: media, data: match[2] },
      };
    }
  }

  const raw = shot.imageBase64?.trim();
  if (raw) {
    const mime = (shot.optimizedMimeType ?? shot.mimeType ?? "image/jpeg") as GlassAskImageBlock["source"]["media_type"];
    const data = raw.replace(/^data:image\/[a-z+]+;base64,/i, "");
    return { type: "image", source: { type: "base64", media_type: mime, data } };
  }

  return null;
}

export function overlayShortAnswer(fullAnswer: string): string {
  const formatted = formatOverlayAnswerText(fullAnswer);
  const firstBlock = formatted.split(/\n\n+/)[0]?.trim() ?? formatted;
  if (firstBlock.length <= 320) return firstBlock;
  return `${firstBlock.slice(0, 317).trim()}…`;
}
