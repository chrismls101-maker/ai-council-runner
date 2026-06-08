/**
 * IIVO Glass visual direct ask — single vision call via Context Bridge screenshot, no Council.
 */

import { getContextItem } from "../contextBridge/contextStore.js";
import type { ContextItem } from "../contextBridge/types.js";
import { getImageVisionConfig } from "../config/vision.js";
import {
  buildGlassModelTryChain,
  recordGlassModelRuntime,
  resolveGlassModelPrimary,
  type GlassModelPurpose,
} from "../config/glassModels.js";
import { runVisionAnswer, type VisionAnswerResult } from "../agents/runVisionAnswer.js";
import { callOpenAIVisionWithModelChain } from "../providers/openai.js";
import { getMaxOutputTokens } from "../config/tokenModes.js";
import { formatGlassDirectAnswer } from "./glassDirectAsk.js";
import type { GlassAskLatestScreenshot, GlassAskRequestBody, GlassAskResponseBody } from "./glassAskTypes.js";

const GLASS_VISUAL_SYSTEM = `You are IIVO Glass, a live AI companion over the user's workspace. When an image is provided, answer based on the image and the user's question. Be concise, practical, and conversational. If the image is unclear, say so. Do not claim to see anything not visible in the image. Do not use council/report formatting.

Use natural phrasing like "I see…", "It looks like…", "You appear to be working on…", or "The error says…" when supported by the image.

Style:
- 1–5 short paragraphs or bullets
- no heavy markdown, no ## headers`;

export const GLASS_CAPTURE_FIRST_MESSAGE =
  "I couldn't capture the screen. Grant Screen Recording permission to IIVO Glass, click Capture, or try again.";

export const GLASS_VISION_NOT_CONFIGURED_MESSAGE =
  "I found your latest capture, but visual analysis is not configured yet.";

function buildVisualUserPrompt(
  prompt: string,
  meta?: GlassAskLatestScreenshot,
  userContext?: string,
): string {
  const lines = [prompt.trim()];
  const contextBlock = userContext?.trim();
  if (contextBlock) {
    lines.push("", contextBlock);
  }
  if (meta?.label || meta?.sourceTitle) {
    lines.push("", "Capture metadata:");
    if (meta.label) lines.push(`- Display: ${meta.label}`);
    if (meta.sourceTitle) lines.push(`- Source: ${meta.sourceTitle}`);
    if (meta.capturedAt) lines.push(`- Captured: ${meta.capturedAt}`);
  }
  lines.push("", "Analyze the attached screenshot image.");
  return lines.join("\n");
}

async function runVisionFromContextItem(
  prompt: string,
  item: ContextItem,
  signal?: AbortSignal,
  purpose: GlassModelPurpose = "default",
  userContext?: string,
): Promise<VisionAnswerResult> {
  return runVisionAnswer({
    prompt: buildVisualUserPrompt(prompt, undefined, userContext),
    contextItem: item,
    signal,
    modelPurpose: purpose,
  });
}

async function runVisionFromDataUrl(
  prompt: string,
  imageDataUrl: string,
  meta: GlassAskLatestScreenshot | undefined,
  signal?: AbortSignal,
  purpose: GlassModelPurpose = "default",
  userContext?: string,
): Promise<VisionAnswerResult> {
  const config = getImageVisionConfig();
  const startedAt = new Date().toISOString();

  if (!config.enabled || !config.configured || !config.model) {
    return {
      output: config.reason ?? GLASS_VISION_NOT_CONFIGURED_MESSAGE,
      meta: {
        status: "error",
        displayName: "IIVO Vision",
        error: config.reason,
        startedAt,
        completedAt: new Date().toISOString(),
      },
      visionTrace: {
        screenshotAnalyzedVisually: false,
        visionConfigured: config.configured,
        visionEnabled: config.enabled,
        error: config.reason,
      },
    };
  }

  try {
    const selected = resolveGlassModelPrimary("vision", purpose);
    const chain = buildGlassModelTryChain(selected);
    const result = await callOpenAIVisionWithModelChain(
      GLASS_VISUAL_SYSTEM,
      buildVisualUserPrompt(prompt, meta, userContext),
      imageDataUrl,
      chain,
      signal,
      getMaxOutputTokens("strategy", "standard"),
    );
    recordGlassModelRuntime("vision", purpose, {
      requestedModel: result.requestedModel,
      selectedModel: result.selectedModel,
      modelUsed: result.modelUsed,
      fallbackUsed: result.fallbackUsed,
      fallbackReason: result.fallbackReason ?? null,
    });
    const completedAt = new Date().toISOString();
    return {
      output: result.content,
      meta: {
        status: "complete",
        displayName: "IIVO Vision",
        startedAt,
        completedAt,
        durationMs: Date.parse(completedAt) - Date.parse(startedAt),
      },
      visionTrace: {
        screenshotAnalyzedVisually: true,
        visionConfigured: true,
        visionEnabled: true,
        visionProvider: result.provider,
        visionModel: result.modelUsed,
        visionModelRequested: result.requestedModel,
        visionFallbackUsed: result.fallbackUsed,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Visual analysis failed.";
    return {
      output: message,
      meta: {
        status: "error",
        displayName: "IIVO Vision",
        error: message,
        startedAt,
        completedAt: new Date().toISOString(),
      },
      visionTrace: {
        screenshotAnalyzedVisually: false,
        visionConfigured: true,
        visionEnabled: true,
        error: message,
      },
    };
  }
}

function resolveImageDataUrl(shot: GlassAskLatestScreenshot | undefined): string | undefined {
  if (!shot) return undefined;
  if (shot.imageDataUrl) return shot.imageDataUrl;
  if (shot.imageBase64) {
    const mime = shot.mimeType ?? "image/png";
    return shot.imageBase64.startsWith("data:")
      ? shot.imageBase64
      : `data:${mime};base64,${shot.imageBase64}`;
  }
  return undefined;
}

function mapVisionToGlassResponse(
  prompt: string,
  vision: VisionAnswerResult,
  contextId?: string,
): GlassAskResponseBody {
  const raw = vision.output.trim();
  const visionDisabled =
    !vision.visionTrace.visionEnabled ||
    (!vision.visionTrace.visionConfigured && /not configured|disabled/i.test(raw));

  if (visionDisabled) {
    return {
      answer: GLASS_VISION_NOT_CONFIGURED_MESSAGE,
      routeUsed: "glass_visual_direct",
      contextId,
      title: prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt,
      warnings: [raw],
    };
  }

  if (!vision.visionTrace.screenshotAnalyzedVisually) {
    const answer =
      raw.includes("not configured") || raw.includes("disabled")
        ? GLASS_VISION_NOT_CONFIGURED_MESSAGE
        : raw || GLASS_VISION_NOT_CONFIGURED_MESSAGE;
    return {
      answer,
      routeUsed: "glass_visual_direct",
      contextId,
      title: prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt,
    };
  }

  const formatted = formatGlassDirectAnswer(raw);
  return {
    answer: formatted.answer,
    shortAnswer: formatted.shortAnswer,
    model: vision.visionTrace.visionModel,
    modelRequested: vision.visionTrace.visionModelRequested,
    modelUsed: vision.visionTrace.visionModel,
    fallbackUsed: vision.visionTrace.visionFallbackUsed,
    routeUsed: "glass_visual_direct",
    usedVision: true,
    contextId,
    title: prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt,
    warnings: formatted.warnings,
  };
}

export async function runGlassVisualDirectAsk(
  body: GlassAskRequestBody,
  signal?: AbortSignal,
): Promise<GlassAskResponseBody> {
  const prompt = body.prompt?.trim() ?? "";
  const userContext = body.userContext?.trim() || undefined;
  const shot = body.latestScreenshot;
  const purpose = body.modelPurpose ?? "default";

  const inlineImage = resolveImageDataUrl(shot);
  if (!shot?.contextId && !inlineImage) {
    return {
      answer: GLASS_CAPTURE_FIRST_MESSAGE,
      routeUsed: "glass_direct",
      title: prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt,
    };
  }

  let vision: VisionAnswerResult;
  const contextId = shot?.contextId;

  if (contextId) {
    const item = await getContextItem(contextId);
    if (!item || item.type !== "screenshot") {
      if (inlineImage) {
        vision = await runVisionFromDataUrl(prompt, inlineImage, shot, signal, purpose, userContext);
      } else {
        return {
          answer: GLASS_CAPTURE_FIRST_MESSAGE,
          routeUsed: "glass_direct",
          title: prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt,
        };
      }
    } else {
      vision = await runVisionFromContextItem(prompt, item, signal, purpose, userContext);
    }
  } else if (inlineImage) {
    vision = await runVisionFromDataUrl(prompt, inlineImage, shot, signal, purpose, userContext);
  } else {
    return {
      answer: GLASS_CAPTURE_FIRST_MESSAGE,
      routeUsed: "glass_direct",
      title: prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt,
    };
  }

  return mapVisionToGlassResponse(prompt, vision, contextId);
}
