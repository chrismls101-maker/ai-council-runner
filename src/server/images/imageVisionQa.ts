import { getImageVisionConfig } from "../config/vision.js";
import { callOpenAIVision } from "../providers/openai.js";
import type { ImageBrief } from "./imageBriefBuilder.js";
import { readStoredImageBuffer } from "./imageStore.js";

export type ImageVisionQaResult = {
  ran: boolean;
  provider?: string;
  findings: string[];
  warnings: string[];
  briefMatchScore?: number;
};

function isMockVisionQa(headers?: Record<string, string | string[] | undefined>): boolean {
  if (process.env.IMAGE_VISION_QA_MOCK === "1") return true;
  if (process.env.NODE_ENV === "test") return true;
  const header = headers?.["x-iivo-mock-vision-qa"];
  return header === "1" || header === "true";
}

function parseVisionResponse(content: string): ImageVisionQaResult {
  const findings: string[] = [];
  const warnings: string[] = [];
  let briefMatchScore = 70;

  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/warning|issue|problem|artifact|text/i.test(line)) warnings.push(line);
    else findings.push(line);
  }

  if (/strong match|matches the brief|fits the use case/i.test(content)) briefMatchScore = 85;
  if (/weak match|off-brief|unclear subject/i.test(content)) {
    briefMatchScore = 45;
    warnings.push("Generated image may not fully match the brief.");
  }

  return {
    ran: true,
    findings: findings.length ? findings : [content.slice(0, 400)],
    warnings,
    briefMatchScore,
  };
}

export async function runOptionalImageVisionQa(input: {
  brief: ImageBrief;
  imageId: string;
  visualType: string;
  headers?: Record<string, string | string[] | undefined>;
}): Promise<ImageVisionQaResult> {
  if (isMockVisionQa(input.headers)) {
    return {
      ran: true,
      provider: "mock",
      findings: [
        "Main subject is visible and centered.",
        `Image appears suitable for ${input.visualType.replace(/_/g, " ")}.`,
      ],
      warnings: [],
      briefMatchScore: 82,
    };
  }

  const config = getImageVisionConfig();
  if (!config.enabled) {
    return { ran: false, findings: [], warnings: [] };
  }
  if (!config.configured) {
    return {
      ran: false,
      findings: [],
      warnings: [config.reason ?? "Visual QA is not configured."],
    };
  }

  const buffer = await readStoredImageBuffer(input.imageId);
  if (!buffer) {
    return {
      ran: false,
      findings: [],
      warnings: ["Generated image file unavailable for visual QA."],
    };
  }

  const mime = "image/png";
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
  const userText = [
    "Review this generated business visual against the brief.",
    `Visual type: ${input.visualType}`,
    `Purpose: ${input.brief.purpose}`,
    `Audience: ${input.brief.audience}`,
    `Style: ${input.brief.styleDirection}`,
    "Answer with brief findings, whether the main subject is visible, use-case fit, and any warnings about text artifacts or commercial readiness.",
  ].join("\n");

  try {
    const result = await callOpenAIVision(
      "You inspect generated business visuals. Be concise. Do not mention competitor product names.",
      userText,
      dataUrl,
      undefined,
      config.model ?? undefined,
      500,
    );
    const parsed = parseVisionResponse(result.content);
    return { ...parsed, provider: config.provider };
  } catch (err) {
    return {
      ran: false,
      findings: [],
      warnings: [err instanceof Error ? err.message : "Visual QA failed."],
    };
  }
}

export function visionQaCreditAddon(): number {
  return Number(process.env.IMAGE_VISION_QA_CREDITS ?? "1") || 1;
}
