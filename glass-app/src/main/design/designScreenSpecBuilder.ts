import {
  buildDesignScreenSpecPrompt,
  parseDesignScreenSpec,
  createFallbackDesignScreenSpec,
} from "../../shared/designToCode.ts";
import { askAnthropicHaikuVision } from "../glassAskAnthropic.ts";

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function buildDesignScreenSpec(
  imageDataUrl: string,
  opts?: { sessionId?: string },
): Promise<import("../../shared/designToCode.ts").DesignScreenSpec> {
  const system =
    "You are a UI decomposition engine. Output strict JSON only — no prose, no markdown.";
  const user = buildDesignScreenSpecPrompt();

  try {
    const raw = await askAnthropicHaikuVision(system, user, imageDataUrl, {
      sessionId: opts?.sessionId,
      maxTokens: 4096,
    });
    const parsed = extractJsonObject(raw);
    if (!parsed) {
      return createFallbackDesignScreenSpec(["spec_parse_failed"]);
    }
    return parseDesignScreenSpec(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return createFallbackDesignScreenSpec([`spec_extraction_error: ${msg.slice(0, 80)}`]);
  }
}
