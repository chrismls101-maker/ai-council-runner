/**
 * Aletheia multi-display awareness (B5.2).
 *
 * Injects connected display layout into companion situational awareness so
 * Aletheia can reference and act on the display the user is actually using.
 */

import type { ConnectedDisplaySnapshot } from "./displayInfo.ts";
import type { GlassDisplayTarget } from "./glassSettings.ts";
import { formatDisplayTargetLabelFromSnapshots } from "./displayInfo.ts";

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

  const lines = [
    "Display awareness — Aletheia may reference these displays when relevant:",
    `- ${displays.length} connected display${displays.length === 1 ? "" : "s"}; Glass target: ${displayTargetLabel}.`,
    `- Overlay/chrome on: ${overlayDisplay.label}.`,
  ];

  if (cursorDisplay && cursorDisplay.id !== overlayDisplay.id) {
    lines.push(`- Cursor is on: ${cursorDisplay.label}.`);
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
    overlayDisplayId: overlayDisplay.id,
    overlayDisplayLabel: overlayDisplay.label,
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
