/**
 * Aletheia multi-display awareness (B5.2).
 *
 * Injects connected display layout into companion situational awareness so
 * Aletheia can reference and act on the display the user is actually using.
 */

import type { ConnectedDisplaySnapshot } from "./displayInfo.ts";
import type { GlassDisplayTarget } from "./glassSettings.ts";
import { formatDisplayTargetLabelFromSnapshots } from "./displayInfo.ts";
import { displayIdContainingPoint } from "./displayTargetMath.ts";

export interface AletheiaDisplayAwarenessSnapshot {
  updatedAt: number;
  displayCount: number;
  displayTarget: GlassDisplayTarget;
  displayTargetLabel: string;
  /** Display where the Glass overlay/chrome is currently laid out. */
  overlayDisplayId: number | null;
  overlayDisplayLabel: string | null;
  /** Display under the cursor (best proxy for user attention). */
  cursorDisplayId: number | null;
  cursorDisplayLabel: string | null;
  activeApp?: string;
  /** Prompt-safe summary for ask enrichment. */
  contextBlock: string;
}

export interface AletheiaDisplayAwarenessInput {
  now?: number;
  connectedDisplays: readonly ConnectedDisplaySnapshot[];
  displayTarget: GlassDisplayTarget;
  overlayDisplayId?: number | null;
  activeApp?: string;
}

export function buildAletheiaDisplayAwareness(
  input: AletheiaDisplayAwarenessInput,
): AletheiaDisplayAwarenessSnapshot | null {
  const displays = input.connectedDisplays;
  if (displays.length === 0) return null;

  const now = input.now ?? Date.now();
  const cursorDisplay = displays.find((row) => row.cursorInside) ?? null;
  const overlayDisplayId = input.overlayDisplayId ?? cursorDisplay?.id ?? displays[0]!.id;
  const overlayDisplay =
    displays.find((row) => row.id === overlayDisplayId) ?? displays[0]!;

  const displayTargetLabel = formatDisplayTargetLabelFromSnapshots(
    input.displayTarget,
    [...displays],
  );

  const followsCursorOnly = input.displayTarget === "follow_mouse";
  const spansAllDisplays =
    input.displayTarget === "all_displays" && displays.length > 1;

  const lines = [
    "Display awareness — Aletheia may reference these displays when relevant:",
    `- ${displays.length} connected display${displays.length === 1 ? "" : "s"}; Glass target: ${displayTargetLabel}.`,
  ];

  if (spansAllDisplays) {
    lines.push(
      `- Glass overlay spans all ${displays.length} connected displays simultaneously.`,
    );
    if (cursorDisplay) {
      lines.push(`- Command bar and dock follow cursor on: ${cursorDisplay.label}.`);
    }
  } else if (followsCursorOnly) {
    lines.push("- Glass overlay and chrome follow the cursor across monitors.");
    if (cursorDisplay) {
      lines.push(`- Cursor/attention on: ${cursorDisplay.label}.`);
    }
  } else {
    lines.push(`- Overlay/chrome on: ${overlayDisplay.label}.`);
    if (cursorDisplay && cursorDisplay.id !== overlayDisplay.id) {
      lines.push(`- Cursor is on: ${cursorDisplay.label}.`);
    }
  }

  for (const display of displays.slice(0, 4)) {
    lines.push(
      `- ${display.label} (${display.bounds.width}×${display.bounds.height}${display.isPrimary ? ", primary" : ""}).`,
    );
  }

  if (input.activeApp?.trim()) {
    lines.push(`- Front app: ${input.activeApp.trim()}.`);
  }

  lines.push(
    "When the user asks about another screen, confirm which display they mean using these labels.",
  );

  return {
    updatedAt: now,
    displayCount: displays.length,
    displayTarget: input.displayTarget,
    displayTargetLabel,
    overlayDisplayId: spansAllDisplays ? null : overlayDisplay.id,
    overlayDisplayLabel: spansAllDisplays
      ? `All ${displays.length} displays`
      : overlayDisplay.label,
    cursorDisplayId: cursorDisplay?.id ?? null,
    cursorDisplayLabel: cursorDisplay?.label ?? null,
    activeApp: input.activeApp?.trim() || undefined,
    contextBlock: lines.join("\n"),
  };
}

export function formatAletheiaDisplayContext(
  snapshot: AletheiaDisplayAwarenessSnapshot | null | undefined,
): string | undefined {
  if (!snapshot || snapshot.displayCount <= 1) return undefined;
  return snapshot.contextBlock;
}

export function displayAwarenessSnapshotsEqual(
  a: AletheiaDisplayAwarenessSnapshot | null | undefined,
  b: AletheiaDisplayAwarenessSnapshot | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.displayCount === b.displayCount
    && a.displayTarget === b.displayTarget
    && a.overlayDisplayId === b.overlayDisplayId
    && a.cursorDisplayId === b.cursorDisplayId
    && a.activeApp === b.activeApp
  );
}

/** Best display for computer-use clicks and screen capture when multi-monitor. */
export function resolveAletheiaActionDisplayId(
  snapshot: AletheiaDisplayAwarenessSnapshot | null | undefined,
): number | null {
  return snapshot?.cursorDisplayId ?? snapshot?.overlayDisplayId ?? null;
}

export function validateClickOnTargetDisplay(
  x: number,
  y: number,
  targetDisplayId: number | null | undefined,
  displays: readonly ConnectedDisplaySnapshot[],
): { ok: true } | { ok: false; message: string } {
  if (targetDisplayId == null || displays.length === 0) return { ok: true };

  const target = displays.find((row) => row.id === targetDisplayId);
  if (!target) return { ok: true };

  const actualId = displayIdContainingPoint(
    { x, y },
    displays.map((row) => ({ id: row.id, bounds: row.bounds })),
    targetDisplayId,
  );
  if (actualId === targetDisplayId) return { ok: true };

  const actualLabel = displays.find((row) => row.id === actualId)?.label ?? "another display";
  return {
    ok: false,
    message: `Click (${x}, ${y}) is on ${actualLabel}, not ${target.label}.`,
  };
}
