import type { GlassLatestScreenshotState } from "./glassScreenContext.ts";

export function createLatestScreenshotState(input: {
  sessionId?: string;
  eventId?: string;
  displayLabel: string;
  displayId: number;
  sourceTitle?: string;
  screenshotPath?: string;
  thumbnailPath?: string;
  mimeType?: string;
  contextId?: string;
  contextUploadStatus?: GlassLatestScreenshotState["contextUploadStatus"];
}): GlassLatestScreenshotState {
  return {
    eventId: input.eventId,
    sessionId: input.sessionId,
    contextId: input.contextId,
    contextUploadStatus: input.contextUploadStatus ?? (input.contextId ? "ready" : "none"),
    capturedAt: new Date().toISOString(),
    sourceTitle: input.sourceTitle,
    displayLabel: input.displayLabel,
    displayId: input.displayId,
    screenshotPath: input.screenshotPath,
    thumbnailPath: input.thumbnailPath,
    mimeType: input.mimeType ?? "image/png",
  };
}
