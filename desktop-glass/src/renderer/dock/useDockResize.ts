import { useLayoutEffect, type RefObject } from "react";

/** Small bleed so shadows never clip; keeps the Electron window >= content (no outer scrollbar). */
const DOCK_SIZE_PADDING = 12;

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
): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const report = (): void => {
      const measured = measureDock(stackRef.current);
      const width = Math.ceil(measured.width) + DOCK_SIZE_PADDING;
      const height = Math.ceil(measured.height) + DOCK_SIZE_PADDING;
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
  }, deps);
}
