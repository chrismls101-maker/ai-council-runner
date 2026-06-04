/**
 * Optional active app/window context for IIVO Glass session events.
 * Never claims detection works when permission is missing.
 */

export type WindowContextStatus =
  | "available"
  | "permission_required"
  | "unavailable"
  | "error";

export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WindowContext = {
  status: WindowContextStatus;
  appName?: string;
  windowTitle?: string;
  sourceName?: string;
  displayName?: string;
  /** Front window bounds in screen coordinates (DIP), when detectable without extra permissions. */
  windowBounds?: WindowBounds;
  reason?: string;
};

export const WINDOW_CONTEXT_PERMISSION_MESSAGE =
  "Active app detection requires macOS Accessibility permission for System Events.";

export const WINDOW_CONTEXT_UNAVAILABLE_MESSAGE =
  "Active app/window detection is not available. Use manual source title or capture source name.";

/** Merge capture-source info into a window context snapshot. */
export function mergeCaptureSource(
  ctx: WindowContext,
  sourceName: string | undefined,
): WindowContext {
  if (!sourceName?.trim()) return ctx;
  return {
    ...ctx,
    sourceName: sourceName.trim(),
    displayName: ctx.appName ?? ctx.windowTitle ?? sourceName.trim(),
    status: ctx.status === "unavailable" ? "available" : ctx.status,
    reason: ctx.reason ?? "From screen capture source",
  };
}

export function windowContextForEvent(ctx: WindowContext): {
  sourceApp?: string;
  sourceTitle?: string;
  metadata: { windowContext: WindowContext };
} {
  const sourceApp = ctx.appName;
  const sourceTitle =
    ctx.windowTitle ?? ctx.displayName ?? ctx.sourceName ?? undefined;
  return {
    sourceApp,
    sourceTitle,
    metadata: { windowContext: ctx },
  };
}
