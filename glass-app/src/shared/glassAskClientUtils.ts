/**
 * Pure Glass ask helpers — no Electron imports (safe for unit tests).
 */

import type { GlassConfig } from "./config.ts";

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
