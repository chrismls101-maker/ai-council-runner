import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  clampTerminalSize,
  saveTerminalSize,
  terminalViewportForClamp,
  type GlassTerminalResizeEdge,
  type GlassTerminalSize,
} from "./glassTerminalLayout.ts";

export function useTerminalPanelResize(
  size: GlassTerminalSize,
  onSizeChange: (next: GlassTerminalSize) => void,
): (edge: GlassTerminalResizeEdge) => (event: ReactPointerEvent<HTMLDivElement>) => void {
  const sizeRef = useRef(size);
  sizeRef.current = size;

  return useCallback(
    (edge: GlassTerminalResizeEdge) => (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);

      const startX = event.clientX;
      const startY = event.clientY;
      const start = sizeRef.current;
      let latest = start;

      const onPointerMove = (ev: PointerEvent): void => {
        let width = start.width;
        let height = start.height;
        if (edge === "e" || edge === "se") {
          width = start.width + (ev.clientX - startX);
        }
        if (edge === "s" || edge === "se") {
          height = start.height + (ev.clientY - startY);
        }
        latest = clampTerminalSize(width, height, terminalViewportForClamp());
        onSizeChange(latest);
        window.dispatchEvent(new CustomEvent("glass-terminal-measure"));
      };

      const endResize = (): void => {
        target.removeEventListener("pointermove", onPointerMove);
        try {
          target.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        saveTerminalSize(latest);
        window.dispatchEvent(new CustomEvent("glass-terminal-measure"));
      };

      target.addEventListener("pointermove", onPointerMove);
      target.addEventListener("pointerup", endResize, { once: true });
      target.addEventListener("pointercancel", endResize, { once: true });
    },
    [onSizeChange],
  );
}
