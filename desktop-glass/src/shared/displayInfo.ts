/**
 * Pure multi-display helpers (testable without Electron).
 */

import type { LayoutRect } from "./glassLayoutMath.ts";
import type { GlassDisplayTarget } from "./glassSettings.ts";
import { displayIdContainingPoint, type DisplayBounds, type ScreenPoint } from "./displayTargetMath.ts";

export interface ConnectedDisplaySnapshot {
  id: number;
  label: string;
  bounds: LayoutRect;
  workArea: LayoutRect;
  scaleFactor: number;
  isPrimary: boolean;
  cursorInside: boolean;
  internal?: boolean;
}

export interface DisplayLike {
  id: number;
  bounds: LayoutRect;
  workArea: LayoutRect;
  scaleFactor: number;
  internal?: boolean;
}

export function labelForDisplay(
  display: Pick<DisplayLike, "id" | "bounds" | "internal">,
  index: number,
  primaryId: number,
): string {
  if (display.id === primaryId) return "Primary Display";
  const displayNumber = index + 1;
  const isExternal = display.internal === false;
  const isLarge = display.bounds.width >= 1920 || display.bounds.height >= 1080;
  if (isExternal && isLarge) return `HDMI Display (Display ${displayNumber})`;
  if (isExternal) return `External Display (Display ${displayNumber})`;
  return `Display ${displayNumber}`;
}

export function buildConnectedDisplaySnapshots(
  displays: DisplayLike[],
  primaryId: number,
  cursor: ScreenPoint,
): ConnectedDisplaySnapshot[] {
  const cursorDisplayId = displayIdContainingPoint(cursor, displays, primaryId);
  return displays.map((display, index) => ({
    id: display.id,
    label: labelForDisplay(display, index, primaryId),
    bounds: { ...display.bounds },
    workArea: { ...display.workArea },
    scaleFactor: display.scaleFactor,
    isPrimary: display.id === primaryId,
    cursorInside: display.id === cursorDisplayId,
    internal: display.internal,
  }));
}

export function resolveEffectiveDisplayId(
  target: GlassDisplayTarget,
  displays: DisplayBounds[],
  cursor: ScreenPoint,
  primaryId: number,
): number {
  if (target === "all_displays") {
    return displayIdContainingPoint(cursor, displays, primaryId) ?? primaryId;
  }
  if (target === "follow_mouse") {
    return displayIdContainingPoint(cursor, displays, primaryId) ?? primaryId;
  }
  if (target === "primary") return primaryId;
  if (displays.some((d) => d.id === target)) return target;
  return primaryId;
}

export function normalizeDisplayTarget(
  target: GlassDisplayTarget,
  connectedIds: number[],
): GlassDisplayTarget {
  if (target === "primary" || target === "follow_mouse") return target;
  if (target === "all_displays") return "primary";
  if (typeof target === "number" && connectedIds.includes(target)) return target;
  return "primary";
}

export function formatDisplayTargetLabelFromSnapshots(
  target: GlassDisplayTarget,
  snapshots: ConnectedDisplaySnapshot[],
): string {
  if (target === "primary") return "Primary Display";
  if (target === "follow_mouse") return "Follow Mouse";
  if (target === "all_displays") return "All Displays Overlay";
  const match = snapshots.find((s) => s.id === target);
  if (match) return match.label;
  return `Display id ${target}`;
}

export function cursorDisplayIdFromSnapshots(snapshots: ConnectedDisplaySnapshot[]): number | null {
  return snapshots.find((s) => s.cursorInside)?.id ?? null;
}
