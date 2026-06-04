/**
 * Pure display-target math (testable without Electron).
 */

export interface DisplayBounds {
  id: number;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Return the display id containing the point, or primary fallback. */
export function displayIdContainingPoint(
  point: ScreenPoint,
  displays: DisplayBounds[],
  primaryFallbackId?: number,
): number | null {
  for (const display of displays) {
    const b = display.bounds;
    if (
      point.x >= b.x &&
      point.x < b.x + b.width &&
      point.y >= b.y &&
      point.y < b.y + b.height
    ) {
      return display.id;
    }
  }
  return primaryFallbackId ?? displays[0]?.id ?? null;
}

export function shouldRelayoutForDisplayChange(
  previousId: number | null,
  nextId: number | null,
): boolean {
  if (nextId == null) return false;
  return previousId !== nextId;
}

/** Throttled poll interval when Follow Mouse display mode is active. */
export const FOLLOW_MOUSE_POLL_MS = 750;
