/**
 * Fresh screen capture for visual command-bar asks (main process).
 */

import type { GlassConfig } from "../shared/config.ts";
import {
  buildLatestScreenshotAskPayload,
  createLatestScreenshotState,
} from "../shared/glassLatestScreenshotAsk.ts";
import type {
  GlassAskLatestScreenshot,
  GlassLatestScreenshotState,
  VisualAskPayloadDiagnostics,
} from "../shared/glassScreenContext.ts";
import { optimizeVisualAskImage } from "./visualImageOptimizer.ts";
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
import { shouldPersistVisualAskToSession } from "../shared/glassScreenshotRetention.ts";
import type { GlassUserSettings } from "../shared/glassSettings.ts";
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
      savedToSession: boolean;
      payloadDiagnostics?: VisualAskPayloadDiagnostics;
      captureWidth: number;
      captureHeight: number;
    }
  | { ok: false; error: string; permissionHint?: boolean };

export type VisualAskCaptureDeps = {
  config: GlassConfig;
  glassSettings: GlassUserSettings;
  sessions: GlassSessionStore;
  sessionIsLive: () => boolean;
  latestScreenshot: GlassLatestScreenshotState | null | undefined;
  pendingCaptureDataUrl: string | undefined;
  resolveCaptureTarget: () => { id: number; label: string };
  prompt?: string;
  onOptimizing?: () => void;
  optimizePreset?: "default" | "aggressive" | "text";
  eventContextFields: (opts?: { sourceTitle?: string; captureSource?: string }) => {
    sourceApp?: string;
    sourceTitle?: string;
    metadata?: Record<string, unknown>;
  };
};

export function applyOptimizedToPayload(
  base: GlassAskLatestScreenshot,
  optimized: ReturnType<typeof optimizeVisualAskImage>,
): GlassAskLatestScreenshot {
  return {
    ...base,
    imageDataUrl: optimized.imageDataUrl,
    mimeType: optimized.mimeType,
    originalWidth: optimized.originalWidth,
    originalHeight: optimized.originalHeight,
    optimizedWidth: optimized.optimizedWidth,
    optimizedHeight: optimized.optimizedHeight,
    optimizedMimeType: optimized.mimeType,
    optimizedSizeBytes: optimized.optimizedSizeBytes,
    compressionApplied: optimized.compressionApplied,
  };
}

function diagnosticsFromOptimized(
  optimized: ReturnType<typeof optimizeVisualAskImage>,
  status: VisualAskPayloadDiagnostics["status"],
): VisualAskPayloadDiagnostics {
  return {
    originalWidth: optimized.originalWidth,
    originalHeight: optimized.originalHeight,
    originalSizeBytes: optimized.originalSizeBytes,
    optimizedWidth: optimized.optimizedWidth,
    optimizedHeight: optimized.optimizedHeight,
    optimizedSizeBytes: optimized.optimizedSizeBytes,
    optimizedMimeType: optimized.mimeType,
    compressionApplied: optimized.compressionApplied,
    status,
  };
}

async function optimizePayloadImage(
  deps: VisualAskCaptureDeps,
  imageDataUrl: string,
  width: number,
  height: number,
): Promise<{
  optimized: ReturnType<typeof optimizeVisualAskImage>;
  diagnostics: VisualAskPayloadDiagnostics;
}> {
  deps.onOptimizing?.();
  const optimized = optimizeVisualAskImage(
    imageDataUrl,
    { width, height },
    { prompt: deps.prompt, preset: deps.optimizePreset },
  );
  return {
    optimized,
    diagnostics: diagnosticsFromOptimized(optimized, deps.optimizePreset === "aggressive" ? "retry" : "ok"),
  };
}

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
  // Keep pixels on disk only; never rely on screenshotDataUrl in persisted JSON.
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
    const saveToSession = shouldPersistVisualAskToSession(deps.glassSettings, deps.sessionIsLive());
    const eventId = saveToSession ? await persistSessionCapture(deps, result) : undefined;

    const latestState = createLatestScreenshotState({
      displayLabel: result.displayLabel,
      displayId: result.displayId,
      sourceTitle: result.sourceName,
      sessionId: session?.id,
      eventId,
      contextUploadStatus: "none",
    });

    const { optimized, diagnostics } = await optimizePayloadImage(
      deps,
      result.imageDataUrl,
      result.width,
      result.height,
    );
    const payload = applyOptimizedToPayload(
      buildPayloadFromCapture(result, session?.id, eventId),
      optimized,
    );
    return {
      ok: true,
      payload,
      fresh: true,
      eventId,
      latestState,
      imageDataUrl: result.imageDataUrl,
      savedToSession: saveToSession && !!eventId,
      payloadDiagnostics: diagnostics,
      captureWidth: result.width,
      captureHeight: result.height,
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
      const rawUrl = fallback.payload.imageDataUrl ?? "";
      const { optimized, diagnostics } = await optimizePayloadImage(deps, rawUrl, 0, 0);
      const payload = applyOptimizedToPayload(fallback.payload, optimized);
      return {
        ok: true,
        payload,
        fresh: false,
        warning: fallback.warning,
        eventId: fallback.payload.eventId,
        latestState,
        imageDataUrl: rawUrl,
        savedToSession: !!fallback.payload.eventId && !!fallback.payload.sessionId,
        payloadDiagnostics: diagnostics,
        captureWidth: optimized.originalWidth,
        captureHeight: optimized.originalHeight,
      };
    }
    return {
      ok: false,
      error: permissionHint ? GLASS_VISUAL_CAPTURE_PERMISSION_MESSAGE : message,
      permissionHint,
    };
  }
}
