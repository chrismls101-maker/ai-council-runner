import { useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { useSplitWithValue } from "./useSplit.ts";

const MIN_WIDTH = 380;
const MAX_RATIO = 0.6;

function clampWidth(width: number): number {
  const max = Math.floor(window.innerWidth * MAX_RATIO);
  return Math.min(max, Math.max(MIN_WIDTH, Math.round(width)));
}

export function useCoderPanelResize(
  width: number,
  onWidthChange: (next: number) => void,
): (event: ReactPointerEvent<HTMLDivElement>) => void {
  const handleCommit = useCallback((next: number): void => {
    window.glass.coderPanelSetWidth(next);
  }, []);

  return useSplitWithValue(width, {
    axis: "horizontal",
    invertDelta: true,
    min: MIN_WIDTH,
    max: Math.floor(window.innerWidth * MAX_RATIO),
    onValueChange: (next) => onWidthChange(clampWidth(next)),
    onCommit: (next) => handleCommit(clampWidth(next)),
  });
}
