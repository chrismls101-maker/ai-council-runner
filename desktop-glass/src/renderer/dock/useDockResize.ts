import { useLayoutEffect, type RefObject } from "react";

const DOCK_SIZE_PADDING = 8;

/** Report dock content size so the main process can resize the frameless window. */
export function useDockResize(ref: RefObject<HTMLElement | null>, deps: unknown[]): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const report = (): void => {
      const width = Math.ceil(el.scrollWidth) + DOCK_SIZE_PADDING;
      const height = Math.ceil(el.scrollHeight) + DOCK_SIZE_PADDING;
      window.glass.resizeDock(width, height);
    };

    report();
    requestAnimationFrame(() => requestAnimationFrame(report));

    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, deps);
}
