import type { ConnectedDisplaySnapshot } from "../../../src/shared/displayInfo.ts";

export interface BoundsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TOLERANCE_PX = 4;

export function boundsNear(a: BoundsRect, b: BoundsRect, tolerance = TOLERANCE_PX): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}

/** Match BrowserWindow bounds to a display (macOS may report menu-bar y offset). */
export function windowBoundsOnDisplay(
  windowBounds: BoundsRect,
  display: ConnectedDisplaySnapshot,
  tolerance = TOLERANCE_PX,
): boolean {
  const allowedY = [display.bounds.y, display.workArea.y];
  const yOk = allowedY.some((y) => Math.abs(windowBounds.y - y) <= tolerance);
  return (
    yOk &&
    Math.abs(windowBounds.x - display.bounds.x) <= tolerance &&
    Math.abs(windowBounds.width - display.bounds.width) <= tolerance &&
    Math.abs(windowBounds.height - display.bounds.height) <= tolerance
  );
}

export function rectInsideWorkArea(rect: BoundsRect, workArea: BoundsRect): boolean {
  return (
    rect.x >= workArea.x - TOLERANCE_PX &&
    rect.y >= workArea.y - TOLERANCE_PX &&
    rect.x + rect.width <= workArea.x + workArea.width + TOLERANCE_PX &&
    rect.y + rect.height <= workArea.y + workArea.height + TOLERANCE_PX
  );
}

export function findPrimaryDisplay(
  displays: ConnectedDisplaySnapshot[],
): ConnectedDisplaySnapshot | undefined {
  return displays.find((d) => d.isPrimary);
}

export function findExternalDisplay(
  displays: ConnectedDisplaySnapshot[],
): ConnectedDisplaySnapshot | undefined {
  return displays.find((d) => !d.isPrimary);
}

export function formatDisplayReport(displays: ConnectedDisplaySnapshot[]): string {
  return displays
    .map(
      (d) =>
        `${d.label} id=${d.id} bounds=${d.bounds.width}x${d.bounds.height}@${d.bounds.x},${d.bounds.y}`,
    )
    .join("; ");
}
