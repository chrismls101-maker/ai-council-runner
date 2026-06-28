import { useLayoutEffect, type RefObject } from "react";

import {
  DOCK_RAIL_TOOLTIP_SIDE_RESERVE,
  DOCK_RAIL_VERTICAL_PADDING,
  DOCK_SIZE_PADDING,
  DOCK_TOOLTIP_SIDE_RESERVE,
  DOCK_TOOLTIP_TOP_RESERVE,
} from "../../shared/glassLayoutMath.ts";

// Re-export for tests / glass.css cross-refs
export {
  DOCK_RAIL_VERTICAL_PADDING,
  DOCK_TOOLTIP_SIDE_RESERVE,
  DOCK_TOOLTIP_TOP_RESERVE,
} from "../../shared/glassLayoutMath.ts";

function measureDock(stack: HTMLElement | null): { width: number; height: number } {
  if (!stack) return { width: 0, height: 0 };
  const box = stack.getBoundingClientRect();
  return {
    width: Math.ceil(box.width),
    height: Math.ceil(box.height),
  };
}

/** Report dock content size so the main process can resize the frameless window. */
export function useDockResize(
  rootRef: RefObject<HTMLElement | null>,
  stackRef: RefObject<HTMLElement | null>,
  _actionsRef: RefObject<HTMLElement | null>,
  deps: unknown[],
  rail = false,
): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const report = (): void => {
      const measured = measureDock(stackRef.current);
      const width =
        Math.ceil(measured.width) + DOCK_SIZE_PADDING + (rail ? DOCK_TOOLTIP_SIDE_RESERVE : 0);
      const height =
        Math.ceil(measured.height) +
        DOCK_SIZE_PADDING +
        (rail ? DOCK_RAIL_VERTICAL_PADDING : DOCK_TOOLTIP_TOP_RESERVE);
      window.glass.resizeDock(width, height);
    };

    const onMeasure = (): void => report();
    window.addEventListener("glass-dock-measure", onMeasure);

    report();
    requestAnimationFrame(() => requestAnimationFrame(report));

    const observer = new ResizeObserver(() => report());
    const stack = stackRef.current;
    const chrome = stack?.querySelector(".dock__chrome");
    if (stack) observer.observe(stack);
    if (chrome instanceof HTMLElement) observer.observe(chrome);
    return () => {
      window.removeEventListener("glass-dock-measure", onMeasure);
      observer.disconnect();
    };
  }, [...deps, rail]);
}
