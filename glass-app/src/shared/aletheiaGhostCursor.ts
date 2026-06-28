/** Aletheia ghost cursor — shared trust signal for computer operator + companion presence. */

export type AletheiaGhostCursorPhase = "approach" | "click" | "hidden";

export interface AletheiaGhostCursorState {
  /** Overlay viewport coordinates (px). */
  x: number;
  y: number;
  phase: AletheiaGhostCursorPhase;
}

export function globalScreenToOverlayViewport(
  screenX: number,
  screenY: number,
  overlayBounds: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: Math.round(screenX - overlayBounds.x),
    y: Math.round(screenY - overlayBounds.y),
  };
}

/** Beat before the OS click executes — user sees where Aletheia is about to act. */
export const ALETHEIA_GHOST_PRE_CLICK_MS = 450;

/** Click pulse duration before clearing the ghost. */
export const ALETHEIA_GHOST_CLICK_MS = 220;
