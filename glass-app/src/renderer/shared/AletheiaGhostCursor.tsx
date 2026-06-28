import type { AletheiaGhostCursorPhase } from "../../shared/aletheiaGhostCursor.ts";
import "./aletheiaGhostCursor.css";

export type AletheiaGhostCursorProps = {
  x: number;
  y: number;
  phase?: AletheiaGhostCursorPhase;
  testId?: string;
};

/**
 * Semi-transparent pointer with white / light-purple halo — Aletheia's trust cursor.
 * Used by computer operator (pre-click) and companion guidance (cursor + path + sketch).
 */
export function AletheiaGhostCursor({
  x,
  y,
  phase = "approach",
  testId = "aletheia-ghost-cursor",
}: AletheiaGhostCursorProps): JSX.Element {
  return (
    <div
      className={`aletheia-ghost-cursor aletheia-ghost-cursor--${phase}`}
      style={{ left: `${x}px`, top: `${y}px` }}
      data-testid={testId}
      aria-hidden="true"
    >
      <svg className="aletheia-ghost-cursor__shape" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 2 L4 18 L9 14 L13 22 L16 21 L12 13 L18 13 Z" />
      </svg>
      <span className="aletheia-ghost-cursor__halo" aria-hidden="true" />
    </div>
  );
}
