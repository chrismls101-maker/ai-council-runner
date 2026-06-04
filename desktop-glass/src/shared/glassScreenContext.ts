/**
 * Glass screen capture context for visual command-bar asks (shared, no Electron).
 */

import {
  formatCaptureAgeSeconds,
  GLASS_SCREEN_CONTEXT_DISPLAY_MAX_AGE_MS,
  GLASS_VISUAL_FALLBACK_MAX_AGE_MS,
  isFallbackGlassCapture,
  isRecentGlassCapture,
  promptRequestsGlassScreenVisual,
} from "./glassVisualIntent.ts";

export {
  formatCaptureAgeSeconds,
  GLASS_SCREEN_CONTEXT_DISPLAY_MAX_AGE_MS,
  GLASS_VISUAL_FALLBACK_MAX_AGE_MS,
  isFallbackGlassCapture,
  isRecentGlassCapture,
  promptRequestsGlassScreenVisual,
};

/** @deprecated use GLASS_SCREEN_CONTEXT_DISPLAY_MAX_AGE_MS */
export const GLASS_SCREEN_CONTEXT_MAX_AGE_MS = GLASS_SCREEN_CONTEXT_DISPLAY_MAX_AGE_MS;

export type GlassScreenContextUploadStatus = "none" | "pending" | "ready" | "failed";

export interface GlassLatestScreenshotState {
  eventId?: string;
  sessionId?: string;
  contextId?: string;
  contextUploadStatus: GlassScreenContextUploadStatus;
  capturedAt: string;
  sourceTitle?: string;
  displayLabel?: string;
  displayId?: number;
  screenshotPath?: string;
  thumbnailPath?: string;
  mimeType?: string;
}

export interface GlassAskLatestScreenshot {
  eventId?: string;
  sessionId?: string;
  contextId?: string;
  screenshotPath?: string;
  thumbnailPath?: string;
  mimeType?: string;
  imageDataUrl?: string;
  capturedAt?: string;
  sourceTitle?: string;
  displayId?: number;
  label?: string;
  originalWidth?: number;
  originalHeight?: number;
  optimizedWidth?: number;
  optimizedHeight?: number;
  optimizedMimeType?: string;
  optimizedSizeBytes?: number;
  compressionApplied?: boolean;
}

export interface VisualAskPayloadDiagnostics {
  originalWidth: number;
  originalHeight: number;
  originalSizeBytes: number;
  optimizedWidth: number;
  optimizedHeight: number;
  optimizedSizeBytes: number;
  optimizedMimeType: string;
  compressionApplied: boolean;
  status: "ok" | "retry" | "failed";
}

export type GlassScreenContextPhase = "idle" | "looking" | "optimizing" | "analyzing";

export type GlassScreenContextStatusKind =
  | "none"
  | "looking"
  | "captured"
  | "ready"
  | "unavailable"
  | "permission_needed"
  | "vision_not_configured";

export interface GlassScreenContextStatus {
  kind: GlassScreenContextStatusKind;
  label: string;
  detail?: string;
  capturedAt?: string;
  ageSeconds?: number;
}

export function buildGlassScreenContextStatus(
  latest: GlassLatestScreenshotState | null | undefined,
  options?: {
    phase?: GlassScreenContextPhase;
    visionConfigured?: boolean;
    lastCaptureError?: string;
  },
): GlassScreenContextStatus {
  if (options?.phase === "looking") {
    return { kind: "looking", label: "Screen: looking now…" };
  }

  if (options?.phase === "optimizing") {
    return { kind: "looking", label: "Screen: optimizing image…" };
  }

  if (options?.phase === "analyzing") {
    return { kind: "looking", label: "Screen: analyzing…" };
  }

  if (options?.lastCaptureError && /permission|screen recording/i.test(options.lastCaptureError)) {
    return {
      kind: "permission_needed",
      label: "Screen: capture permission needed",
      detail: options.lastCaptureError,
    };
  }

  if (!latest?.capturedAt) {
    return { kind: "none", label: "Screen: no capture" };
  }

  const ageSeconds = formatCaptureAgeSeconds(latest.capturedAt);
  const ageLabel =
    ageSeconds == null
      ? ""
      : ageSeconds < 60
        ? `${ageSeconds}s ago`
        : `${Math.round(ageSeconds / 60)}m ago`;

  if (!isRecentGlassCapture(latest.capturedAt)) {
    return {
      kind: "unavailable",
      label: "Screen: capture unavailable",
      detail: "Capture is too old — ask again or click Capture.",
      capturedAt: latest.capturedAt,
      ageSeconds,
    };
  }

  if (latest.contextUploadStatus === "ready" && latest.contextId) {
    return {
      kind: "ready",
      label: `Screen: visual ready (${ageLabel})`.replace(" ()", ""),
      capturedAt: latest.capturedAt,
      ageSeconds,
    };
  }

  if (latest.contextUploadStatus === "failed") {
    return {
      kind: "captured",
      label: `Screen: captured ${ageLabel}`,
      detail: "Vision uses inline image; Context Bridge sync optional.",
      capturedAt: latest.capturedAt,
      ageSeconds,
    };
  }

  if (latest.contextUploadStatus === "pending") {
    return {
      kind: "captured",
      label: `Screen: captured ${ageLabel} (syncing…)`,
      capturedAt: latest.capturedAt,
      ageSeconds,
    };
  }

  if (options?.visionConfigured === false) {
    return {
      kind: "vision_not_configured",
      label: "Screen: vision unavailable",
      detail: "Enable IMAGE_VISION_ENABLED on the IIVO server.",
      capturedAt: latest.capturedAt,
      ageSeconds,
    };
  }

  return {
    kind: "captured",
    label: `Screen: captured ${ageLabel}`,
    capturedAt: latest.capturedAt,
    ageSeconds,
  };
}
