/**
 * Fresh screen capture for visual command-bar asks (main process).
 */

import type { GlassConfig } from "../shared/config.ts";
import {
  buildLatestScreenshotAskPayload,
  createLatestScreenshotState,
} from "../shared/glassLatestScreenshotAsk.ts";
import type { GlassAskLatestScreenshot, GlassLatestScreenshotState } from "../shared/glassScreenContext.ts";
import {
  formatCaptureAgeSeconds,
  isFallbackGlassCapture,
  isRecentGlassCapture,
} from "../shared/glassVisualIntent.ts";
import type { GlassSession } from "../shared/sessionTypes.ts";
import type { CaptureResult } from "./capture.ts";
import { captureDisplayById } from "./capture.ts";
import { captureErrorMessage } from "../shared/glassOperations.ts";
import { readScreenshotDataUrl, saveSessionScreenshot } from "./sessionScreenshots.ts";
import type { GlassSessionStore } from "../shared/sessionStore.ts";

export const GLASS_VISUAL_CAPTURE_PERMISSION_MESSAGE =
  "I couldn't capture the screen. Check Screen Recording permission in System Settings, then try again.";

export type VisualAskCaptureOutcome =
  | {
      ok: true;
      payload: GlassAskLatestScreenshot;
      fresh: boolean;
      warning?: string;
      eventId?: string;
      latestState: GlassLatestScreenshotState;
      imageDataUrl: string;
    }
  | { ok: false; error: string; permissionHint?: boolean };

export type VisualAskCaptureDeps = {
  config: GlassConfig;
  sessions: GlassSessionStore;
  sessionIsLive: () => boolean;
  latestScreenshot: GlassLatestScreenshotState | null | undefined;
  pendingCaptureDataUrl: string | undefined;
  resolveCaptureTarget: () => { id: number; label: string };
  eventContextFields: (opts?: { sourceTitle?: string; captureSource?: string }) => {
    sourceApp?: string;
    sourceTitle?: string;
    metadata?: Record<string, unknown>;
  };
};

async function persistSessionCapture(
  deps: VisualAskCaptureDeps,
  result: CaptureResult,
): Promise<string | undefined> {
  if (!deps.sessionIsLive()) return undefined;
  const session = deps.sessions.current();
  if (!session) return undefined;

  const ctxFields = deps.eventContextFields({ captureSource: result.sourceName });
  const event = deps.sessions.addEvent({
    kind: "screen_capture",
    title: `Screen capture · ${result.displayLabel} (${result.width}×${result.height})`,
    sourceApp: ctxFields.sourceApp,
    sourceTitle: ctxFields.sourceTitle ?? result.sourceName,
    importance: "medium",
    metadata: ctxFields.metadata,
  });
  if (!event) return undefined;

  const refs = await saveSessionScreenshot(session.id, event.id, result.imageDataUrl);
  event.screenshotPath = refs.screenshotPath;
  event.thumbnailPath = refs.thumbnailPath;
  event.screenshotMimeType = refs.screenshotMimeType;
  event.screenshotSizeBytes = refs.screenshotSizeBytes;
  event.screenshotDataUrl = result.imageDataUrl;
  return event.id;
}

function buildPayloadFromCapture(
  result: CaptureResult,
  sessionId: string | undefined,
  eventId: string | undefined,
  contextId?: string,
): GlassAskLatestScreenshot {
  const capturedAt = new Date().toISOString();
  return {
    eventId,
    sessionId,
    contextId,
    imageDataUrl: result.imageDataUrl,
    mimeType: "image/png",
    capturedAt,
    sourceTitle: result.sourceName,
    displayId: result.displayId,
    label: result.displayLabel,
  };
}

async function fallbackPayload(
  deps: VisualAskCaptureDeps,
): Promise<{ payload: GlassAskLatestScreenshot; warning: string } | null> {
  const latest = deps.latestScreenshot;
  if (latest?.capturedAt && isFallbackGlassCapture(latest.capturedAt)) {
    const payload = await buildLatestScreenshotAskPayload({
      latest,
      pendingDataUrl: deps.pendingCaptureDataUrl,
      session: deps.sessions.current(),
      readEventDataUrl: readScreenshotDataUrl,
    });
    if (payload) {
      const age = formatCaptureAgeSeconds(latest.capturedAt) ?? 0;
      return {
        payload,
        warning: `Using your last capture from ${age}s ago.`,
      };
    }
  }

  const session = deps.sessions.current();
  if (session) {
    for (const event of [...session.events].reverse()) {
      if (event.kind !== "screen_capture" || !event.timestamp) continue;
      if (!isFallbackGlassCapture(event.timestamp)) continue;
      const dataUrl = await readScreenshotDataUrl(event);
      if (!dataUrl) continue;
      const age = formatCaptureAgeSeconds(event.timestamp) ?? 0;
      return {
        payload: {
          eventId: event.id,
          sessionId: session.id,
          imageDataUrl: dataUrl,
          mimeType: event.screenshotMimeType ?? "image/png",
          capturedAt: event.timestamp,
          sourceTitle: event.sourceTitle,
          label: latest?.displayLabel,
          displayId: latest?.displayId,
        },
        warning: `Using your last capture from ${age}s ago.`,
      };
    }
  }

  if (deps.pendingCaptureDataUrl && latest?.capturedAt && isRecentGlassCapture(latest.capturedAt)) {
    const age = formatCaptureAgeSeconds(latest.capturedAt) ?? 0;
    if (age <= 60) {
      return {
        payload: {
          imageDataUrl: deps.pendingCaptureDataUrl,
          mimeType: latest.mimeType ?? "image/png",
          capturedAt: latest.capturedAt,
          eventId: latest.eventId,
          sessionId: latest.sessionId,
          displayId: latest.displayId,
          label: latest.displayLabel,
          sourceTitle: latest.sourceTitle,
          contextId: latest.contextId,
        },
        warning: `Using your last capture from ${age}s ago.`,
      };
    }
  }

  return null;
}

/**
 * Capture active Glass display for a visual ask; fall back to recent capture within 60s.
 */
export async function resolveScreenshotForVisualAsk(
  deps: VisualAskCaptureDeps,
): Promise<VisualAskCaptureOutcome> {
  const target = deps.resolveCaptureTarget();

  try {
    const result = await captureDisplayById(target.id, target.label);
    const session = deps.sessions.current();
    const eventId = await persistSessionCapture(deps, result);

    const latestState = createLatestScreenshotState({
      displayLabel: result.displayLabel,
      displayId: result.displayId,
      sourceTitle: result.sourceName,
      sessionId: session?.id,
      eventId,
      contextUploadStatus: "pending",
    });

    const payload = buildPayloadFromCapture(result, session?.id, eventId);
    return {
      ok: true,
      payload,
      fresh: true,
      eventId,
      latestState,
      imageDataUrl: result.imageDataUrl,
    };
  } catch (err) {
    const message = captureErrorMessage(err);
    const permissionHint = /permission|screen recording/i.test(message);
    const fallback = await fallbackPayload(deps);
    if (fallback) {
      const capturedAt = fallback.payload.capturedAt ?? new Date().toISOString();
      const latestState: GlassLatestScreenshotState = {
        eventId: fallback.payload.eventId,
        sessionId: fallback.payload.sessionId,
        contextId: fallback.payload.contextId,
        contextUploadStatus: fallback.payload.contextId ? "ready" : "none",
        capturedAt,
        sourceTitle: fallback.payload.sourceTitle,
        displayLabel: fallback.payload.label,
        displayId: fallback.payload.displayId,
        mimeType: fallback.payload.mimeType,
      };
      return {
        ok: true,
        payload: fallback.payload,
        fresh: false,
        warning: fallback.warning,
        eventId: fallback.payload.eventId,
        latestState,
        imageDataUrl: fallback.payload.imageDataUrl ?? "",
      };
    }
    return {
      ok: false,
      error: permissionHint ? GLASS_VISUAL_CAPTURE_PERMISSION_MESSAGE : message,
      permissionHint,
    };
  }
}
