/**
 * Glass Guide — display bounds for multi-monitor accuracy.
 */

import { screen } from "electron";
import type { DisplayBounds } from "../shared/liveOrientationTypes.ts";
import { getCachedWindowContext, refreshWindowContext } from "./windowContext.ts";

/** Prefer frontmost window center (correct display when cursor is on another monitor). */
export function getOrientationAnchorPoint(): { x: number; y: number } {
  const ctx = getCachedWindowContext();
  if (ctx.status === "available" && ctx.windowBounds) {
    const b = ctx.windowBounds;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  return screen.getCursorScreenPoint();
}

export async function refreshOrientationAnchorPoint(): Promise<{ x: number; y: number }> {
  const ctx = await refreshWindowContext();
  if (ctx.status === "available" && ctx.windowBounds) {
    const b = ctx.windowBounds;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  return screen.getCursorScreenPoint();
}

export function getCursorDisplayBounds(): DisplayBounds {
  const point = getOrientationAnchorPoint();
  const display = screen.getDisplayNearestPoint(point);
  return { ...display.bounds };
}

export function getDisplayBoundsAtPoint(x: number, y: number): DisplayBounds {
  const display = screen.getDisplayNearestPoint({ x, y });
  return { ...display.bounds };
}

/** Convert logical screen point to physical pixels for AppleScript System Events clicks. */
export function osClickCoordinates(
  logicalX: number,
  logicalY: number,
): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({ x: logicalX, y: logicalY });
  const scale = display.scaleFactor ?? 1;
  return {
    x: Math.round(logicalX * scale),
    y: Math.round(logicalY * scale),
  };
}
