import { useEffect, type RefObject } from "react";
import { send } from "./useGlassState.ts";

const INTERACTIVE_SELECTOR = "button, input, textarea, a, [data-chrome-no-drag]";

/** Pointer-driven window move for frameless dock / command bar (IPC to main). */
export function useChromeWindowDrag(
  active: boolean,
  surfaceRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) return;
    const surface = surfaceRef.current;
    if (!surface) return;

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest(INTERACTIVE_SELECTOR)) return;

      event.preventDefault();
      surface.setPointerCapture(event.pointerId);

      let lastX = event.screenX;
      let lastY = event.screenY;

      const onPointerMove = (moveEvent: PointerEvent): void => {
        const dx = moveEvent.screenX - lastX;
        const dy = moveEvent.screenY - lastY;
        lastX = moveEvent.screenX;
        lastY = moveEvent.screenY;
        if (dx !== 0 || dy !== 0) {
          send({ type: "chrome-window-drag", dx, dy });
        }
      };

      const end = (endEvent: PointerEvent): void => {
        try {
          surface.releasePointerCapture(endEvent.pointerId);
        } catch {
          // capture may already be released
        }
        surface.removeEventListener("pointermove", onPointerMove);
        surface.removeEventListener("pointerup", end);
        surface.removeEventListener("pointercancel", end);
      };

      surface.addEventListener("pointermove", onPointerMove);
      surface.addEventListener("pointerup", end);
      surface.addEventListener("pointercancel", end);
    };

    surface.addEventListener("pointerdown", onPointerDown);
    return () => surface.removeEventListener("pointerdown", onPointerDown);
  }, [active, surfaceRef]);
}
