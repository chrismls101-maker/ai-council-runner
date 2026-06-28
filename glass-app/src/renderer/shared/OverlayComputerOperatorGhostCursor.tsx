import type { AletheiaComputerOperatorSnapshot } from "../../shared/aletheiaComputerOperatorLoop.ts";
import { AletheiaGhostCursor } from "./AletheiaGhostCursor.tsx";

interface OverlayComputerOperatorGhostCursorProps {
  operator?: AletheiaComputerOperatorSnapshot;
}

export function OverlayComputerOperatorGhostCursor({
  operator,
}: OverlayComputerOperatorGhostCursorProps): JSX.Element | null {
  const ghost = operator?.ghostCursor;
  if (!ghost || ghost.phase === "hidden") return null;
  if (operator?.phase !== "running" && operator?.phase !== "paused") return null;

  return (
    <AletheiaGhostCursor
      x={ghost.x}
      y={ghost.y}
      phase={ghost.phase}
      testId="overlay-computer-operator-ghost-cursor"
    />
  );
}
