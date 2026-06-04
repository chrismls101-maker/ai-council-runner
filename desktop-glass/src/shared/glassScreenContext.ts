/**
 * Glass screen capture context for visual command-bar asks (shared, no Electron).
 */

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
}

const GLASS_SCREEN_VISUAL_PATTERNS = [
  /\bwhat'?s on (?:my |the )?screen\b/i,
  /\bwhat am i looking at\b/i,
  /\bwhat do you see\b/i,
  /\bread this error\b/i,
  /\bexplain what'?s on (?:my |the )?screen\b/i,
  /\bwhat should i do with this page\b/i,
  /\bsummarize this screen\b/i,
  /\bon (?:my |the )?screen\b/i,
  /\bthis (?:page|screen|window|ui)\b/i,
  /\bwhat'?s (?:shown|displayed|visible)\b/i,
  /\bscreenshot\b/i,
  /\bvisually\b/i,
];

export function promptRequestsGlassScreenVisual(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  return GLASS_SCREEN_VISUAL_PATTERNS.some((pattern) => pattern.test(text));
}

/** Max age for a capture to count as “recent” for visual ask (ms). */
export const GLASS_SCREEN_CONTEXT_MAX_AGE_MS = 30 * 60 * 1000;

export function isRecentGlassCapture(capturedAt: string, nowMs = Date.now()): boolean {
  const t = Date.parse(capturedAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= GLASS_SCREEN_CONTEXT_MAX_AGE_MS;
}

export type GlassScreenContextStatusKind =
  | "none"
  | "captured"
  | "ready"
  | "unavailable"
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
  options?: { visionConfigured?: boolean },
): GlassScreenContextStatus {
  if (!latest?.capturedAt) {
    return { kind: "none", label: "Screen context: none" };
  }

  const ageMs = Date.now() - Date.parse(latest.capturedAt);
  const ageSeconds = Number.isFinite(ageMs) ? Math.max(0, Math.round(ageMs / 1000)) : undefined;
  const ageLabel =
    ageSeconds == null
      ? ""
      : ageSeconds < 60
        ? `${ageSeconds}s ago`
        : `${Math.round(ageSeconds / 60)}m ago`;

  if (!isRecentGlassCapture(latest.capturedAt)) {
    return {
      kind: "unavailable",
      label: "Screen context: capture unavailable",
      detail: "Capture is too old — click Capture again.",
      capturedAt: latest.capturedAt,
      ageSeconds,
    };
  }

  if (latest.contextUploadStatus === "ready" && latest.contextId) {
    return {
      kind: "ready",
      label: `Screen context: visual analysis ready (${ageLabel})`.replace(" ()", ""),
      capturedAt: latest.capturedAt,
      ageSeconds,
    };
  }

  if (latest.contextUploadStatus === "failed") {
    return {
      kind: "unavailable",
      label: `Screen context: captured ${ageLabel} (upload pending retry on ask)`,
      capturedAt: latest.capturedAt,
      ageSeconds,
    };
  }

  if (latest.contextUploadStatus === "pending") {
    return {
      kind: "captured",
      label: `Screen context: captured ${ageLabel} (syncing…)`,
      capturedAt: latest.capturedAt,
      ageSeconds,
    };
  }

  if (options?.visionConfigured === false) {
    return {
      kind: "vision_not_configured",
      label: "Screen context: vision not configured",
      detail: "Capture saved locally; enable IMAGE_VISION_ENABLED on the server.",
      capturedAt: latest.capturedAt,
      ageSeconds,
    };
  }

  return {
    kind: "captured",
    label: `Screen context: captured ${ageLabel}`,
    capturedAt: latest.capturedAt,
    ageSeconds,
  };
}
