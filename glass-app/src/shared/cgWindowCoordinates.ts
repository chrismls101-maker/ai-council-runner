/**
 * Convert macOS CGWindow (bottom-left origin) bounds to top-left screen coordinates.
 */

import type { WindowBounds } from "./windowContextTypes.ts";

export interface DisplayBoundsSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Virtual desktop frame in Electron top-left coordinates. */
export function virtualDesktopFrame(displays: DisplayBoundsSnapshot[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (displays.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = displays[0].x;
  let minY = displays[0].y;
  let maxX = displays[0].x + displays[0].width;
  let maxY = displays[0].y + displays[0].height;
  for (const d of displays) {
    minX = Math.min(minX, d.x);
    minY = Math.min(minY, d.y);
    maxX = Math.max(maxX, d.x + d.width);
    maxY = Math.max(maxY, d.y + d.height);
  }
  return { minX, minY, maxX, maxY };
}

/** Flip CGWindow bounds into the same top-left space as Electron display.bounds. */
export function flipCgWindowBoundsToTopLeft(
  cg: WindowBounds,
  displays: DisplayBoundsSnapshot[],
): WindowBounds {
  const frame = virtualDesktopFrame(displays);
  const yTop = frame.maxY - (cg.y + cg.height);
  return {
    x: cg.x,
    y: yTop,
    width: cg.width,
    height: cg.height,
  };
}
