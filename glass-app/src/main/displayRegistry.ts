/**
 * Electron display registry for IIVO Glass.
 */

import { screen, type Display } from "electron";
import {
  buildConnectedDisplaySnapshots,
  cursorDisplayIdFromSnapshots,
  formatDisplayTargetLabelFromSnapshots,
  normalizeDisplayTarget,
  resolveEffectiveDisplayId,
  type ConnectedDisplaySnapshot,
  type DisplayLike,
} from "../shared/displayInfo.ts";
import {
  displayContextFromDisplay,
  type DisplayLayoutContext,
} from "./glassLayoutManager.ts";
import type { GlassDisplayTarget } from "../shared/glassSettings.ts";
import { getLastFollowMouseDisplayId } from "./followMouseDisplay.ts";

function displayLikeFromElectron(display: Display): DisplayLike {
  return {
    id: display.id,
    bounds: { ...display.bounds },
    workArea: { ...display.workArea },
    scaleFactor: display.scaleFactor,
    internal: display.internal,
  };
}

export function getCursorScreenPoint() {
  return screen.getCursorScreenPoint();
}

export function listConnectedDisplaySnapshots(): ConnectedDisplaySnapshot[] {
  const displays = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  const cursor = getCursorScreenPoint();
  return buildConnectedDisplaySnapshots(
    displays.map(displayLikeFromElectron),
    primaryId,
    cursor,
  );
}

export function listConnectedDisplayIds(): number[] {
  return screen.getAllDisplays().map((d) => d.id);
}

export function resolveActiveDisplayId(target: GlassDisplayTarget): number {
  const displays = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  const cursor = getCursorScreenPoint();
  const bounds = displays.map((d) => ({ id: d.id, bounds: { ...d.bounds } }));
  return resolveEffectiveDisplayId(target, bounds, cursor, primaryId);
}

export function resolveLayoutDisplayContext(target: GlassDisplayTarget): DisplayLayoutContext {
  const activeId = resolveActiveDisplayId(target);
  const match = screen.getAllDisplays().find((d) => d.id === activeId);
  if (match) return displayContextFromDisplay(match);
  return displayContextFromDisplay(screen.getPrimaryDisplay());
}

export function sanitizeDisplayTarget(target: GlassDisplayTarget): GlassDisplayTarget {
  return normalizeDisplayTarget(target, listConnectedDisplayIds());
}

export function labelForDisplayId(displayId: number): string {
  const snapshots = listConnectedDisplaySnapshots();
  return snapshots.find((s) => s.id === displayId)?.label ?? `Display id ${displayId}`;
}

export function resolveCaptureDisplay(target: GlassDisplayTarget): { id: number; label: string } {
  const id = resolveActiveDisplayId(target);
  return { id, label: labelForDisplayId(id) };
}

export function buildDisplayDiagnosticsSummary(opts: {
  target: GlassDisplayTarget;
  layoutDisplay: DisplayLayoutContext;
  overlayBounds: { width: number; height: number; x: number; y: number };
  commandBarBounds: { width: number; height: number; x: number; y: number };
  panelBounds: { width: number; height: number; x: number; y: number } | null;
  panelVisible: boolean;
  followMouseActive: boolean;
}): string {
  const snapshots = listConnectedDisplaySnapshots();
  const targetLabel = formatDisplayTargetLabelFromSnapshots(opts.target, snapshots);
  const cursorId = cursorDisplayIdFromSnapshots(snapshots);
  const followInfo =
    opts.target === "all_displays"
      ? " · multi-display overlay"
      : opts.target === "follow_mouse" && opts.followMouseActive
        ? ` · cursor id${getLastFollowMouseDisplayId() ?? cursorId ?? "?"}`
        : cursorId != null
          ? ` · cursor id${cursorId}`
          : "";
  const panelPart = opts.panelVisible && opts.panelBounds
    ? ` · panel x${opts.panelBounds.x},y${opts.panelBounds.y}`
    : "";
  return [
    `${snapshots.length} display(s)`,
    `mode=${targetLabel}`,
    `active id${opts.layoutDisplay.id}${followInfo}`,
    `overlay ${opts.overlayBounds.width}x${opts.overlayBounds.height} @${opts.overlayBounds.x},${opts.overlayBounds.y}`,
    `commandBar y${opts.commandBarBounds.y}${panelPart}`,
  ].join(" · ");
}
