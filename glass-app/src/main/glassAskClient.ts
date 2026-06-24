/**
 * Glass direct ask client (main process).
 *
 * Local-first: Anthropic Messages API via safeStorage key.
 * Railway /api/glass/ask is retired for inference.
 */

import type { GlassConfig } from "../shared/config.ts";
import type { GlassAskRequest, GlassAskResponse } from "../shared/glassAskTypes.ts";
import {
  askGlassAnthropic,
  askGlassAnthropicStream,
  GlassAskNoAnthropicKeyError,
} from "./glassAskAnthropic.ts";
import { enrichGlassAskRequestWithMemory } from "./glassMemoryHelpers.ts";

/** @deprecated Inference no longer uses Railway. Kept for diagnostics only. */
export function buildGlassAskUrl(config: GlassConfig): string {
  return `${config.iivoApiUrl}/api/glass/ask`;
}

/** @deprecated Inference no longer uses Railway. Kept for diagnostics only. */
export function buildGlassAskStreamUrl(config: GlassConfig): string {
  return `${config.iivoApiUrl}/api/glass/ask/stream`;
}

export class GlassAskCancelledError extends Error {
  constructor() {
    super("Glass ask cancelled");
    this.name = "GlassAskCancelledError";
  }
}

export { GlassAskNoAnthropicKeyError };

export function isGlassAskPayloadTooLargeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /\b413\b/.test(err.message) || /payload too large/i.test(err.message);
}

function wrapAskError(err: unknown, signal?: AbortSignal): never {
  if (signal?.aborted) throw new GlassAskCancelledError();
  if (err instanceof GlassAskCancelledError) throw err;
  if (err instanceof GlassAskNoAnthropicKeyError) throw err;
  if (err instanceof Error && /cancel/i.test(err.message)) {
    throw new GlassAskCancelledError();
  }
  throw err instanceof Error ? err : new Error(String(err));
}

export async function askIivoGlass(
  _config: GlassConfig,
  request: GlassAskRequest,
  signal?: AbortSignal,
): Promise<GlassAskResponse> {
  try {
    const enriched = await enrichGlassAskRequestWithMemory(request);
    return await askGlassAnthropic(enriched, signal);
  } catch (err) {
    return wrapAskError(err, signal);
  }
}

export async function askIivoGlassStream(
  _config: GlassConfig,
  request: GlassAskRequest,
  onToken: (partial: string) => void,
  signal?: AbortSignal,
): Promise<GlassAskResponse> {
  if (signal?.aborted) throw new GlassAskCancelledError();
  try {
    const enriched = await enrichGlassAskRequestWithMemory(request);
    return await askGlassAnthropicStream(enriched, onToken, signal);
  } catch (err) {
    return wrapAskError(err, signal);
  }
}
