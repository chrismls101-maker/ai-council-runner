/**
 * Glass IDE — stream diff card ↔ editor line sync (reveal + pulse).
 */

import type { DiffLine } from "./diff.ts";
import { firstChangedLineFromDisplay } from "./glassIdeInlineDiff.ts";
import { linesToPulseFromDisplay } from "./glassIdePresence.ts";

export const GLASS_IDE_REVEAL_HUNK_EVENT = "glass-ide-reveal-hunk";

export interface GlassIdeDiffHunk {
  index: number;
  startLine: number;
  endLine: number;
}

export interface GlassIdeRevealHunkDetail {
  relativePath: string;
  displayLines?: DiffLine[];
}

/** Group display diff lines into hunks (contiguous add/remove runs). */
export function groupDiffIntoHunks(displayLines?: DiffLine[]): GlassIdeDiffHunk[] {
  if (!displayLines?.length) return [];

  const hunks: GlassIdeDiffHunk[] = [];
  let inHunk = false;
  let startLine = 1;
  let endLine = 1;

  for (const line of displayLines) {
    if (line.collapsed) continue;
    const changed = line.op === "add" || line.op === "remove";
    const lineNo = line.afterLineNo ?? line.beforeLineNo ?? 1;

    if (changed) {
      if (!inHunk) {
        inHunk = true;
        startLine = lineNo;
        endLine = lineNo;
      } else {
        endLine = lineNo;
      }
    } else if (inHunk) {
      hunks.push({ index: hunks.length, startLine, endLine });
      inHunk = false;
    }
  }

  if (inHunk) {
    hunks.push({ index: hunks.length, startLine, endLine });
  }

  return hunks;
}

export function revealLineAndPulseFromDisplay(
  displayLines?: DiffLine[],
): { revealLine: number; pulseLines: number[] } {
  const pulseLines = linesToPulseFromDisplay(displayLines);
  const revealLine = displayLines?.length
    ? firstChangedLineFromDisplay(displayLines)
    : (pulseLines[0] ?? 1);
  return { revealLine, pulseLines };
}

export function dispatchGlassIdeRevealHunk(detail: GlassIdeRevealHunkDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(GLASS_IDE_REVEAL_HUNK_EVENT, { detail }),
  );
}
