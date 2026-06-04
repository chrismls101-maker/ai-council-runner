/**
 * Tracks latest Glass screen capture for visual command-bar asks.
 */

import type { GlassConfig } from "../shared/config.ts";
import { buildScreenshotContextPayload } from "../shared/contextPayload.ts";
import {
  buildLatestScreenshotAskPayload as buildAskPayload,
  createLatestScreenshotState,
} from "../shared/glassLatestScreenshotAsk.ts";
import type { GlassAskLatestScreenshot } from "../shared/glassScreenContext.ts";
import { createScreenshotContext } from "../shared/iivoClient.ts";
import type { GlassSession } from "../shared/sessionTypes.ts";
import { readScreenshotDataUrl } from "./sessionScreenshots.ts";

export { createLatestScreenshotState };

export async function uploadGlassScreenshotContext(
  config: GlassConfig,
  imageDataUrl: string,
  title: string,
): Promise<string | undefined> {
  try {
    const payload = buildScreenshotContextPayload({ title });
    const item = await createScreenshotContext(config, payload, imageDataUrl);
    return item.id;
  } catch {
    return undefined;
  }
}

export async function buildLatestScreenshotAskPayload(input: {
  latest: import("../shared/glassScreenContext.ts").GlassLatestScreenshotState | undefined;
  pendingDataUrl: string | undefined;
  session: GlassSession | null;
}): Promise<GlassAskLatestScreenshot | undefined> {
  return buildAskPayload({
    ...input,
    readEventDataUrl: readScreenshotDataUrl,
  });
}
