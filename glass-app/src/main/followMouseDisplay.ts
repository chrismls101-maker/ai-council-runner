/**
 * Follow Mouse display tracking for IIVO Glass (Electron main process).
 */

import { screen } from "electron";
import type { GlassDisplayTarget } from "../shared/glassSettings.ts";
import {
  displayIdContainingPoint,
  FOLLOW_MOUSE_POLL_MS,
  shouldRelayoutForDisplayChange,
} from "../shared/displayTargetMath.ts";

let followMouseTimer: ReturnType<typeof setInterval> | null = null;
let lastResolvedDisplayId: number | null = null;
let onDisplayChanged: (() => void) | null = null;

export function resolveFollowMouseDisplayId(): number {
  const point = screen.getCursorScreenPoint();
  const displays = screen.getAllDisplays().map((d) => ({
    id: d.id,
    bounds: { ...d.bounds },
  }));
  const primary = screen.getPrimaryDisplay().id;
  return displayIdContainingPoint(point, displays, primary) ?? primary;
}

export function syncFollowMouseDisplay(force = false): boolean {
  const nextId = resolveFollowMouseDisplayId();
  const changed = force || shouldRelayoutForDisplayChange(lastResolvedDisplayId, nextId);
  if (changed) {
    lastResolvedDisplayId = nextId;
    onDisplayChanged?.();
  }
  return changed;
}

export function startFollowMouseTracking(
  target: GlassDisplayTarget,
  relayout: () => void,
): void {
  stopFollowMouseTracking();
  onDisplayChanged = relayout;

  if (target !== "follow_mouse" && target !== "all_displays") return;

  syncFollowMouseDisplay(true);
  followMouseTimer = setInterval(() => {
    syncFollowMouseDisplay(false);
  }, FOLLOW_MOUSE_POLL_MS);
}

export function stopFollowMouseTracking(): void {
  if (followMouseTimer) {
    clearInterval(followMouseTimer);
    followMouseTimer = null;
  }
  lastResolvedDisplayId = null;
  onDisplayChanged = null;
}

export function isFollowMouseTrackingActive(): boolean {
  return followMouseTimer != null;
}

export function getLastFollowMouseDisplayId(): number | null {
  return lastResolvedDisplayId;
}
