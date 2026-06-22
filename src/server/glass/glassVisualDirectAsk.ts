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
import { callAnthropicVisionWithModelChain } from "../providers/anthropic.js";
import { getMaxOutputTokens } from "../config/tokenModes.js";
import { formatGlassDirectAnswer } from "./glassDirectAsk.js";
import { buildGlassLensContextBlock } from "./glassLensContext.js";
import {
  appendCompanionSessionPrompt,
  buildCompanionVisionAppend,
  buildCompanionCaptureId,
  companionSpeechFromGuidance,
  extractCompanionFence,
  stripCompanionFence,
  formatUiMapForVisionPrompt,
} from "./glassCompanionGuidance.js";
import {
  buildRetargetSystemPrompt,
  buildRetargetUserPrompt,
} from "./glassCompanionRetarget.js";
import type { GlassAskLatestScreenshot, GlassAskRequestBody, GlassAskResponseBody } from "./glassAskTypes.js";

const GLASS_VISUAL_SYSTEM = `You are IIVO Glass, a live AI companion rendered on a dark glass overlay. When an image is provided, answer based on what you can see. Be concise, practical, and conversational. If the image is unclear, say so. Do not claim to see anything not visible in the image.

Use natural phrasing like "I see…", "It looks like…", "You appear to be working on…", or "The error says…" when supported by the image.

Formatting — rendered on a dark glass UI, use markdown to make answers beautiful and scannable:
- Use ## or ### for section headers when the answer has distinct sections
- Use **bold** to highlight the single most important term, error, or action per section — sparingly
- Use ==highlight== around the single most critical thing to act on in the whole answer (only once)
- Use bullet lists for observations, steps, or options; numbered lists for ordered steps
- Use \`inline code\` for error messages, commands, file names, and technical identifiers
- Short paragraphs (2–3 sentences) for prose`;

export const GLASS_CAPTURE_FIRST_MESSAGE =
  "I couldn't capture the screen. Grant Screen Recording permission to IIVO Glass, click Capture, or try again.";

export const GLASS_VISION_NOT_CONFIGURED_MESSAGE =
  "I found your latest capture, but visual analysis is not configured yet.";

function buildVisualUserPrompt(
  prompt: string,
  meta?: GlassAskLatestScreenshot,
  userContext?: string,
  lensContext?: GlassAskRequestBody["lensContext"],
  companionUiMap?: GlassAskRequestBody["companionUiMap"],
  companionRoute?: GlassAskRequestBody["companionRoute"],
  companionMemory?: GlassAskRequestBody["companionMemory"],
): string {
  const basePrompt =
    companionRoute === "retarget" && companionMemory
      ? buildRetargetUserPrompt(prompt, companionMemory)
      : prompt.trim();
  const lines = [basePrompt];
  const contextBlock = userContext?.trim();
  if (contextBlock) {
    lines.push("", contextBlock);
  }
  if (companionUiMap?.marks?.length) {
    lines.push(formatUiMapForVisionPrompt(companionUiMap));
  }
  const lensBlock = buildGlassLensContextBlock(lensContext);
  if (lensBlock) {
    lines.push("", lensBlock);
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

function buildVisualSystemPrompt(
  companionMode?: boolean,
  shot?: GlassAskLatestScreenshot,
  companionRoute?: GlassAskRequestBody["companionRoute"],
  prompt?: string,
): string {
  if (!companionMode) return GLASS_VISUAL_SYSTEM;
  const sessionBase = appendCompanionSessionPrompt(GLASS_VISUAL_SYSTEM);
  if (companionRoute === "retarget") {
    return sessionBase + buildRetargetSystemPrompt(shot);
  }
  return sessionBase + buildCompanionVisionAppend(shot, prompt);
}

async function runVisionFromContextItem(
  prompt: string,
  item: ContextItem,
  signal?: AbortSignal,
  purpose: GlassModelPurpose = "default",
  userContext?: string,
  lensContext?: GlassAskRequestBody["lensContext"],
  companionMode?: boolean,
  shot?: GlassAskLatestScreenshot,
  companionUiMap?: GlassAskRequestBody["companionUiMap"],
  companionRoute?: GlassAskRequestBody["companionRoute"],
  companionMemory?: GlassAskRequestBody["companionMemory"],
): Promise<VisionAnswerResult> {
  return runVisionAnswer({
    prompt: buildVisualUserPrompt(
      prompt,
      shot,
      userContext,
      lensContext,
      companionUiMap,
      companionRoute,
      companionMemory,
    ),
    contextItem: item,
    signal,
    modelPurpose: purpose,
    systemPrompt: buildVisualSystemPrompt(companionMode, shot, companionRoute, prompt),
  });
}

async function runVisionFromDataUrl(
  prompt: string,
  imageDataUrl: string,
  meta: GlassAskLatestScreenshot | undefined,
  signal?: AbortSignal,
  purpose: GlassModelPurpose = "default",
  userContext?: string,
  lensContext?: GlassAskRequestBody["lensContext"],
  companionMode?: boolean,
  companionUiMap?: GlassAskRequestBody["companionUiMap"],
  companionRoute?: GlassAskRequestBody["companionRoute"],
  companionMemory?: GlassAskRequestBody["companionMemory"],
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
    const result = await callAnthropicVisionWithModelChain(
      buildVisualSystemPrompt(companionMode, meta, companionRoute, prompt),
      buildVisualUserPrompt(
        prompt,
        meta,
        userContext,
        lensContext,
        companionUiMap,
        companionRoute,
        companionMemory,
      ),
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
  companionMode?: boolean,
  shot?: GlassAskLatestScreenshot,
): GlassAskResponseBody {
  const rawOutput = vision.output.trim();
  const captureId = buildCompanionCaptureId(shot);
  const companionPayload = companionMode
    ? extractCompanionFence(rawOutput, captureId)
    : null;
  const raw = companionPayload ? stripCompanionFence(rawOutput) : rawOutput;
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
  const guidanceSpeech = companionSpeechFromGuidance(companionPayload?.guidancePlan);
  return {
    answer: formatted.answer,
    shortAnswer: guidanceSpeech || formatted.shortAnswer,
    model: vision.visionTrace.visionModel,
    modelRequested: vision.visionTrace.visionModelRequested,
    modelUsed: vision.visionTrace.visionModel,
    fallbackUsed: vision.visionTrace.visionFallbackUsed,
    routeUsed: "glass_visual_direct",
    usedVision: true,
    contextId,
    title: prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt,
    warnings: formatted.warnings,
    companionGuidance: companionPayload ?? undefined,
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
  const companionMode = body.companionMode === true;
  const companionUiMap = body.companionUiMap;
  const companionRoute = body.companionRoute;
  const companionMemory = body.companionMemory;

  const inlineImage =
    resolveImageDataUrl(shot) ??
    (body.lensContext?.screenshot?.startsWith("data:")
      ? body.lensContext.screenshot
      : undefined);
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
        vision = await runVisionFromDataUrl(
          prompt,
          inlineImage,
          shot,
          signal,
          purpose,
          userContext,
          body.lensContext,
          companionMode,
          companionUiMap,
          companionRoute,
          companionMemory,
        );
      } else {
        return {
          answer: GLASS_CAPTURE_FIRST_MESSAGE,
          routeUsed: "glass_direct",
          title: prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt,
        };
      }
    } else {
      vision = await runVisionFromContextItem(
        prompt,
        item,
        signal,
        purpose,
        userContext,
        body.lensContext,
        companionMode,
        shot,
        companionUiMap,
        companionRoute,
        companionMemory,
      );
    }
  } else if (inlineImage) {
    vision = await runVisionFromDataUrl(
      prompt,
      inlineImage,
      shot,
      signal,
      purpose,
      userContext,
      body.lensContext,
      companionMode,
      companionUiMap,
      companionRoute,
      companionMemory,
    );
  } else {
    return {
      answer: GLASS_CAPTURE_FIRST_MESSAGE,
      routeUsed: "glass_direct",
      title: prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt,
    };
  }

  return mapVisionToGlassResponse(prompt, vision, contextId, companionMode, shot);
}
