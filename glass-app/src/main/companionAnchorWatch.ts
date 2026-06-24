/**
 * Glass Companion — anchor drift detection during active presence (Phase 4d).
 */

import type { WindowBounds } from "../shared/windowContextTypes.ts";

export interface AnchorWatchSnapshot {
  bounds?: WindowBounds;
  appName?: string;
  windowTitle?: string;
}

export const ANCHOR_DRIFT_POSITION_THRESHOLD_PX = 8;
export const ANCHOR_DRIFT_SIZE_THRESHOLD_PX = 12;

export function captureAnchorSnapshot(input: {
  bounds?: WindowBounds;
  appName?: string;
  windowTitle?: string;
}): AnchorWatchSnapshot {
  return {
    bounds: input.bounds ? { ...input.bounds } : undefined,
    appName: input.appName,
    windowTitle: input.windowTitle,
  };
}

export function anchorWatchDrifted(
  baseline: AnchorWatchSnapshot | null | undefined,
  current: AnchorWatchSnapshot,
): boolean {
  if (!baseline) return false;

  if (
    baseline.appName &&
    current.appName &&
    baseline.appName.toLowerCase() !== current.appName.toLowerCase()
  ) {
    return true;
  }

  if (
    baseline.windowTitle &&
    current.windowTitle &&
    baseline.windowTitle !== current.windowTitle
  ) {
    return true;
  }

  if (!baseline.bounds || !current.bounds) return false;

  const dx = Math.abs(baseline.bounds.x - current.bounds.x);
  const dy = Math.abs(baseline.bounds.y - current.bounds.y);
  const dw = Math.abs(baseline.bounds.width - current.bounds.width);
  const dh = Math.abs(baseline.bounds.height - current.bounds.height);

  return (
    dx > ANCHOR_DRIFT_POSITION_THRESHOLD_PX ||
    dy > ANCHOR_DRIFT_POSITION_THRESHOLD_PX ||
    dw > ANCHOR_DRIFT_SIZE_THRESHOLD_PX ||
    dh > ANCHOR_DRIFT_SIZE_THRESHOLD_PX
  );
}

export const COMPANION_ANCHOR_INVALIDATED_SPEECH =
  "The screen moved — let me look again.";

export const COMPANION_ANCHOR_INVALIDATED_NOTICE =
  "Screen moved — Companion highlights cleared. Ask again to re-ground.";
