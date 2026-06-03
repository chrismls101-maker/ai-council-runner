import { getImageVisionConfig } from "../config/vision.js";
import {
  loadScreenshotForVision,
  ScreenshotLoaderError,
  type LoadedScreenshotImage,
} from "../contextBridge/screenshotLoader.js";
import type { ContextItem } from "../contextBridge/types.js";
import { sourceConfidenceLabel, sourceConfidenceFromType } from "../contextBridge/contextConfidence.js";
import { getMaxOutputTokens } from "../config/tokenModes.js";
import { normalizeTokenMode } from "../config/tokenModes.js";
import { buildAgentCost } from "../pricing/calculateCost.js";
import { callOpenAIVision } from "../providers/openai.js";
import type { ProviderResult } from "../providers/types.js";
import type { AgentCost, AgentMeta } from "../types/index.js";

const VISION_ANSWER_SYSTEM = `You are IIVO — a sharp founder/operator assistant analyzing a screenshot the user explicitly captured and attached.

Analyze what is visible in the screenshot image. Be concrete about layout, text, UI elements, charts, warnings, or design choices you can see.

Rules:
- Describe only what you can reasonably infer from the visible screenshot.
- If something is unclear or unreadable, say so.
- Connect visual observations to practical implications, risks, and next steps when helpful.
- Do not invent content that is not visible.
- Be concise but thorough.`;

export interface VisionAnalysisTrace {
  screenshotAnalyzedVisually: boolean;
  visionConfigured: boolean;
  visionEnabled: boolean;
  visionProvider?: string;
  visionModel?: string;
  screenshotTitle?: string;
  sourceUrl?: string;
  imageSizeBytes?: number;
  imageMimeType?: string;
  captureType?: string;
  error?: string;
}

export interface VisionAnswerResult {
  output: string;
  meta: AgentMeta;
  cost?: AgentCost;
  visionTrace: VisionAnalysisTrace;
}

function buildVisionUserText(
  prompt: string,
  screenshot: LoadedScreenshotImage,
  item: ContextItem,
): string {
  const lines = [
    prompt.trim(),
    "",
    "Screenshot metadata:",
    `- Title: ${screenshot.title}`,
  ];
  if (screenshot.pageTitle) lines.push(`- Page title: ${screenshot.pageTitle}`);
  if (screenshot.sourceUrl) lines.push(`- Source URL: ${screenshot.sourceUrl}`);
  if (screenshot.captureType) lines.push(`- Capture type: ${screenshot.captureType}`);
  lines.push(`- Source confidence: ${sourceConfidenceLabel(sourceConfidenceFromType(item.type))}`);
  if (item.contentText?.trim()) {
    lines.push("", "Additional text context:", item.contentText.trim());
  }
  lines.push("", "Analyze the attached screenshot image.");
  return lines.join("\n");
}

function visionNotConfiguredResult(reason: string): VisionAnswerResult {
  return {
    output:
      "Visual analysis is not configured in this build. The screenshot is attached as evidence with metadata only.",
    meta: {
      status: "error",
      displayName: "IIVO Vision",
      error: reason,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
    visionTrace: {
      screenshotAnalyzedVisually: false,
      visionConfigured: false,
      visionEnabled: getImageVisionConfig().enabled,
      error: reason,
    },
  };
}

export async function runVisionAnswer(input: {
  prompt: string;
  contextItem: ContextItem;
  tokenMode?: unknown;
  signal?: AbortSignal;
}): Promise<VisionAnswerResult> {
  const startedAt = new Date().toISOString();
  const config = getImageVisionConfig();

  if (!config.enabled) {
    return visionNotConfiguredResult(config.reason ?? "Image vision is disabled.");
  }

  if (!config.configured || !config.model) {
    return visionNotConfiguredResult(config.reason ?? "Image vision is not configured.");
  }

  let screenshot: LoadedScreenshotImage;
  try {
    screenshot = await loadScreenshotForVision(input.contextItem);
  } catch (err) {
    const message =
      err instanceof ScreenshotLoaderError
        ? err.message
        : "Could not load screenshot for visual analysis.";
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
        visionProvider: config.provider,
        visionModel: config.model,
        screenshotTitle: input.contextItem.title,
        sourceUrl: input.contextItem.sourceUrl,
        error: message,
      },
    };
  }

  const userText = buildVisionUserText(input.prompt, screenshot, input.contextItem);
  const tokenMode = normalizeTokenMode(input.tokenMode);
  const maxOutputTokens = getMaxOutputTokens("strategy", tokenMode);

  try {
    const result: ProviderResult = await callOpenAIVision(
      VISION_ANSWER_SYSTEM,
      userText,
      screenshot.imageDataUrl,
      input.signal,
      config.model,
      maxOutputTokens,
    );

    const completedAt = new Date().toISOString();
    const cost = buildAgentCost(
      result.provider,
      result.model,
      result.usage.inputTokens,
      result.usage.outputTokens,
      result.usage.totalTokens,
      result.usage.usageAvailable,
    );

    return {
      output: result.content,
      meta: {
        status: "complete",
        displayName: "IIVO Vision",
        startedAt,
        completedAt,
        durationMs: Date.parse(completedAt) - Date.parse(startedAt),
      },
      cost,
      visionTrace: {
        screenshotAnalyzedVisually: true,
        visionConfigured: true,
        visionEnabled: true,
        visionProvider: result.provider,
        visionModel: result.model,
        screenshotTitle: screenshot.title,
        sourceUrl: screenshot.sourceUrl,
        imageSizeBytes: screenshot.imageSizeBytes,
        imageMimeType: screenshot.imageMimeType,
        captureType: screenshot.captureType,
      },
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? `Provider image analysis failed: ${err.message}`
        : "Provider image analysis failed.";
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
        visionProvider: config.provider,
        visionModel: config.model,
        screenshotTitle: screenshot.title,
        sourceUrl: screenshot.sourceUrl,
        imageSizeBytes: screenshot.imageSizeBytes,
        imageMimeType: screenshot.imageMimeType,
        captureType: screenshot.captureType,
        error: message,
      },
    };
  }
}
