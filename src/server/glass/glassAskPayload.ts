/**
 * Glass /api/glass/ask payload size guards.
 */

import type { GlassAskRequestBody } from "./glassAskTypes.js";

const MAX_VISUAL_IMAGE_DATA_URL_BYTES = 5_000_000;

export class GlassAskPayloadTooLargeError extends Error {
  readonly status = 413;
  constructor(message = "Screen image was too large. IIVO will retry with a smaller visual frame.") {
    super(message);
    this.name = "GlassAskPayloadTooLargeError";
  }
}

function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  const base64 = dataUrl.slice(comma + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function validateGlassAskPayloadSize(body: GlassAskRequestBody): void {
  const shot = body.latestScreenshot;
  const dataUrl = shot?.imageDataUrl;
  if (!dataUrl) return;

  const bytes = shot.optimizedSizeBytes ?? dataUrlBytes(dataUrl);
  if (bytes > MAX_VISUAL_IMAGE_DATA_URL_BYTES) {
    throw new GlassAskPayloadTooLargeError();
  }
}
