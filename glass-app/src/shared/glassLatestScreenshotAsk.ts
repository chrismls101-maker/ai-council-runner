/**
 * Build Glass ask payload for latest screenshot (no Electron).
 */

import type { GlassAskLatestScreenshot, GlassLatestScreenshotState } from "./glassScreenContext.ts";
import { isRecentGlassCapture } from "./glassScreenContext.ts";
import type { GlassSession, GlassSessionEvent } from "./sessionTypes.ts";

export { createLatestScreenshotState } from "./glassScreenContextState.ts";

export async function resolveLatestScreenshotDataUrl(
  latest: GlassLatestScreenshotState | undefined,
  pendingDataUrl: string | undefined,
  session: GlassSession | null,
  readEventDataUrl: (event: GlassSessionEvent) => Promise<string | null>,
): Promise<string | null> {
  if (latest && isRecentGlassCapture(latest.capturedAt)) {
    if (latest.eventId && session) {
      const event = session.events.find((e) => e.id === latest.eventId);
      if (event) {
        const fromEvent = await readEventDataUrl(event);
        if (fromEvent) return fromEvent;
      }
    }
  }

  if (pendingDataUrl) return pendingDataUrl;

  if (!session) return null;
  const captures = session.events
    .filter((e): e is GlassSessionEvent & { kind: "screen_capture" } => e.kind === "screen_capture")
    .slice()
    .reverse();
  for (const event of captures) {
    const at = event.timestamp ?? latest?.capturedAt;
    if (at && !isRecentGlassCapture(at)) continue;
    const url = await readEventDataUrl(event);
    if (url) return url;
  }
  return null;
}

export async function buildLatestScreenshotAskPayload(input: {
  latest: GlassLatestScreenshotState | undefined;
  pendingDataUrl: string | undefined;
  session: GlassSession | null;
  readEventDataUrl: (event: GlassSessionEvent) => Promise<string | null>;
}): Promise<GlassAskLatestScreenshot | undefined> {
  const { latest, pendingDataUrl, session, readEventDataUrl } = input;
  if (!latest?.capturedAt || !isRecentGlassCapture(latest.capturedAt)) {
    return undefined;
  }

  const payload: GlassAskLatestScreenshot = {
    eventId: latest.eventId,
    sessionId: latest.sessionId,
    capturedAt: latest.capturedAt,
    sourceTitle: latest.sourceTitle,
    displayId: latest.displayId,
    label: latest.displayLabel,
    mimeType: latest.mimeType,
  };

  if (latest.contextId && latest.contextUploadStatus === "ready") {
    payload.contextId = latest.contextId;
    return payload;
  }

  const dataUrl = await resolveLatestScreenshotDataUrl(
    latest,
    pendingDataUrl,
    session,
    readEventDataUrl,
  );
  if (dataUrl) {
    payload.imageDataUrl = dataUrl;
    return payload;
  }

  return undefined;
}
