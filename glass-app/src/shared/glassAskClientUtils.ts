/**
 * Pure Glass ask helpers — no Electron imports (safe for unit tests).
 */

import type { GlassConfig } from "./config.ts";
import { VOICE_ASK_STATUS } from "./glassAskTiming.ts";

/** @deprecated Inference no longer uses Railway. Kept for diagnostics only. */
export function buildGlassAskUrl(config: GlassConfig): string {
  return `${config.iivoApiUrl}/api/glass/ask`;
}

/** @deprecated Inference no longer uses Railway. Kept for diagnostics only. */
export function buildGlassAskStreamUrl(config: GlassConfig): string {
  return `${config.iivoApiUrl}/api/glass/ask/stream`;
}

export function isGlassAskPayloadTooLargeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /\b413\b/.test(err.message) || /payload too large/i.test(err.message);
}

export function isGlassAskMissingKeyError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "GlassAskNoAnthropicKeyError" || /no anthropic api key found/i.test(err.message);
}

/** User-facing copy for command-bar / overlay ask failures. */
export function formatGlassAskErrorForUser(err: unknown): string {
  if (isGlassAskMissingKeyError(err)) {
    return "Connect your Anthropic API key to use Glass AI. Open Settings → API Keys, or use the activation screen.";
  }
  if (isGlassAskPayloadTooLargeError(err)) {
    return "The screen capture was too large to send. Try a smaller area or rephrase your question.";
  }
  if (err instanceof Error) {
    const raw = err.message.trim();
    if (!raw) {
      return "Glass could not reach the AI service. Check your connection and try again.";
    }
    if (raw === VOICE_ASK_STATUS.timeout || /taking longer than expected/i.test(raw)) {
      return VOICE_ASK_STATUS.timeout;
    }
    if (/anthropic returned an empty answer/i.test(raw)) {
      return "The AI returned an empty response. Try asking again.";
    }
    if (/council-formatted output/i.test(raw)) {
      return "The AI returned an unexpected format. Try rephrasing your question.";
    }
    if (/\b503\b|service unavailable|temporarily unavailable/i.test(raw)) {
      return "Anthropic's API is temporarily unavailable. Try again in a moment.";
    }
    if (/\b529\b|overloaded_error|overloaded/i.test(raw)) {
      return "Anthropic's API is busy. Try again shortly.";
    }
    if (/timed?\s*out|timeout|ETIMEDOUT|AbortError|aborted/i.test(raw)) {
      return VOICE_ASK_STATUS.timeout;
    }
    // Strip trailing JSON error blobs from SDK messages.
    const withoutJson = raw.replace(/\s*\{[\s\S]*\}\s*$/, "").trim();
    if (withoutJson && withoutJson.length < raw.length) {
      return withoutJson;
    }
    return raw;
  }
  return "Glass could not reach the AI service. Check your connection and try again.";
}
