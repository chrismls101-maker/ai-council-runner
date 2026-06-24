import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { armIdeOverlayPointer } from "../glassTextInteraction.ts";

function armIdeOverlayDrag(): void {
  armIdeOverlayPointer();
}

function releaseIdeOverlayDrag(): void {
  window.glass?.setOverlayPointerOverIde?.(false);
}

export { armIdeOverlayDrag, releaseIdeOverlayDrag };

export type SplitAxis = "horizontal" | "vertical";

export interface UseSplitOptions {
  axis: SplitAxis;
  /** Positive delta grows the leading pane (left or top). */
  invertDelta?: boolean;
  min: number;
  max: number;
  onValueChange: (next: number) => void;
  onCommit?: (next: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function useSplitWithValue(
  current: number,
  options: Omit<UseSplitOptions, "onValueChange"> & {
    onValueChange: (next: number) => void;
  },
): (event: ReactPointerEvent<HTMLDivElement>) => void {
  const valueRef = useRef(current);
  valueRef.current = current;

  const { axis, invertDelta, min, max, onValueChange, onCommit } = options;

  return useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      armIdeOverlayDrag();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);

      const start = axis === "horizontal" ? event.clientX : event.clientY;
      const startValue = valueRef.current;
      let latest = startValue;

      const onPointerMove = (ev: PointerEvent): void => {
        const pos = axis === "horizontal" ? ev.clientX : ev.clientY;
        const rawDelta = pos - start;
        const delta = invertDelta ? -rawDelta : rawDelta;
        latest = clamp(startValue + delta, min, max);
        onValueChange(latest);
      };

      const endResize = (): void => {
        target.removeEventListener("pointermove", onPointerMove);
        try {
          target.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        releaseIdeOverlayDrag();
        onCommit?.(latest);
      };

      target.addEventListener("pointermove", onPointerMove);
      target.addEventListener("pointerup", endResize, { once: true });
      target.addEventListener("pointercancel", endResize, { once: true });
    },
    [axis, invertDelta, min, max, onValueChange, onCommit],
  );
}
