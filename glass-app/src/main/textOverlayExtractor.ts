/**
 * Glass this — Haiku vision extraction from screenshots.
 */

import { listApiKeys, getApiKeyValue } from "./apiKeyStore.ts";
import type {
  TextContentType,
  TextOverlayExtraction,
  TextOverlayTrigger,
} from "../shared/textOverlayTypes.ts";
import { parseTextOverlayVisionJson } from "../shared/textOverlayTypes.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const EXTRACT_TIMEOUT_MS = 12_000;

const EXTRACTION_PROMPT = `Look at this screenshot. Extract:
1. The complete logical unit of text that is most prominent or selected — if it's a legal clause, extract the full clause; if it's a paragraph in an email, extract the full paragraph; if it's a single term or sentence, extract that sentence. Do not truncate mid-thought. Maximum ~600 characters.
2. The name of the application or website.
3. Classify this text into exactly one of: legal_contract, technical_doc, email, financial_doc, foreign_language, medical_health, research_paper, regulatory_compliance, earnings_transcript, meeting_notes, other.
4. The bounding box of that logical text unit within this image, as fractions of the image dimensions (0-1): left, top, width, height. Be precise — the box should tightly wrap the text you extracted.

Respond as JSON only:
{
  "logicalUnit": string,
  "appName": string | null,
  "contentType": string,
  "confidence": "high" | "low",
  "textBounds": { "left": number, "top": number, "width": number, "height": number } | null
}`;

function resolveAnthropicKey(): string | null {
  const keys = listApiKeys();
  for (const meta of keys) {
    if (meta.service.toLowerCase().includes("anthropic")) {
      const value = getApiKeyValue(meta.id);
      if (value) return value;
    }
  }
  return process.env.ANTHROPIC_API_KEY?.trim() ?? null;
}

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl.trim());
  if (!match) {
    return { mediaType: "image/png", base64: dataUrl };
  }
  return { mediaType: match[1], base64: match[2] };
}

export async function extractTextFromScreenshot(input: {
  imageDataUrl: string;
  knownRawText?: string;
  triggerSource: TextOverlayTrigger;
  activeAppHint?: string | null;
}): Promise<TextOverlayExtraction | null> {
  const apiKey = resolveAnthropicKey();
  if (!apiKey) return null;

  const { mediaType, base64 } = parseDataUrl(input.imageDataUrl);
  const userPrompt = input.knownRawText
    ? `${EXTRACTION_PROMPT}\n\nThe user already selected or copied this text (use it as rawText context): "${input.knownRawText.slice(0, 400)}"`
    : EXTRACTION_PROMPT;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              { type: "text", text: userPrompt },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textBlock = data.content?.find((c) => c.type === "text");
    const parsed = textBlock?.text ? parseTextOverlayVisionJson(textBlock.text) : null;
    if (!parsed) return null;

    const rawText = input.knownRawText?.trim() || parsed.logicalUnit;
    return {
      ...parsed,
      rawText,
      triggerSource: input.triggerSource,
      appName: parsed.appName ?? input.activeAppHint ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function buildExtractionFromKnownText(input: {
  rawText: string;
  triggerSource: TextOverlayTrigger;
  appName?: string | null;
  contentType?: TextContentType;
}): TextOverlayExtraction {
  const trimmed = input.rawText.trim();
  return {
    rawText: trimmed,
    logicalUnit: trimmed.slice(0, 600),
    appName: input.appName ?? null,
    triggerSource: input.triggerSource,
    contentType: input.contentType ?? "other",
    confidence: "high",
  };
}
