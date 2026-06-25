/**
 * IIVO Glass direct ask HTTP handler — single AI only, no Council.
 */

import { InsufficientCreditsError } from "../usage/types.js";
import { assertAiCallsEnabled } from "../founder/featureFlags.js";
import type { GlassAskRequestBody, GlassAskResponseBody } from "./glassAskTypes.js";
import {
  ProviderError,
  runGlassDirectAsk,
  validateGlassDirectApiKey,
  type GlassDirectAskCaller,
} from "./glassDirectAsk.js";
import { resolveGlassAskUsesVisual } from "./glassScreenVisualPrompt.js";
import { runGlassVisualDirectAsk } from "./glassVisualDirectAsk.js";
import { runGlassCompanionDirectFollowUp } from "./glassCompanionRetarget.js";

export {
  buildGlassDirectUserPrompt,
  formatGlassDirectAnswer,
  GLASS_DIRECT_SYSTEM_PROMPT,
  runGlassDirectAsk,
  runGlassDirectAskStream,
  validateGlassDirectApiKey,
} from "./glassDirectAsk.js";

export async function handleGlassAsk(
  body: GlassAskRequestBody,
  signal?: AbortSignal,
  caller?: GlassDirectAskCaller,
): Promise<GlassAskResponseBody> {
  try {
    await assertAiCallsEnabled();
  } catch (err) {
    throw new GlassAskServiceError(
      err instanceof Error ? err.message : "AI calls are disabled.",
      503,
    );
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    throw new GlassAskValidationError("prompt is required");
  }

  const missing = validateGlassDirectApiKey();
  if (missing.length > 0) {
    throw new GlassAskServiceError(
      `Missing API keys: ${missing.join(", ")}. Add them to your .env file.`,
      503,
    );
  }

  try {
    if (
      body.companionMode &&
      (body.companionRoute === "direct_follow_up" || body.companionRoute === "script_continue") &&
      body.companionMemory
    ) {
      return await runGlassCompanionDirectFollowUp(body, signal, caller);
    }

    const hasScreenshot = Boolean(
      body.latestScreenshot?.imageDataUrl ||
        body.latestScreenshot?.imageBase64 ||
        body.latestScreenshot?.contextId ||
        body.lensContext?.screenshot,
    );
    const visual = resolveGlassAskUsesVisual(prompt, {
      visualIntent: body.visualIntent,
      hasInlineScreenshot: hasScreenshot,
    });
    if (visual) {
      return await runGlassVisualDirectAsk(body, signal);
    }
    return await runGlassDirectAsk(body, signal, caller);
  } catch (err) {
    if (err instanceof ProviderError) {
      throw new GlassAskServiceError(err.message, 502);
    }
    throw err;
  }
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
