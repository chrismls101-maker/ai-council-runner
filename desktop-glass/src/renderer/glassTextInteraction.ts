import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

let clickThroughEnabled = true;
let reroutingContextMenu = false;

/** Keep renderer click-through state aligned with the command bar window. */
export function syncGlassClickThrough(enabled: boolean): void {
  clickThroughEnabled = enabled;
  window.glass.setIgnoreMouse(enabled);
}

/** Right-click before context menu — needed when command bar uses click-through forwarding. */
export function prepareGlassTextPointerDown(event: ReactPointerEvent): void {
  if (event.button !== 2) return;
  syncGlassClickThrough(false);
}

/** @deprecated use prepareGlassTextPointerDown */
export const prepareGlassTextMouseDown = prepareGlassTextPointerDown;

/** Allow native cut/copy/paste/select-all menus in click-through Glass windows. */
export function prepareGlassTextContextMenu(event: ReactMouseEvent<HTMLElement>): void {
  const wasClickThrough = clickThroughEnabled;
  syncGlassClickThrough(false);

  if (reroutingContextMenu || !wasClickThrough) {
    return;
  }

  event.preventDefault();
  reroutingContextMenu = true;

  const target = event.currentTarget;
  const { clientX, clientY, screenX, screenY } = event;

  requestAnimationFrame(() => {
    target.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
        screenX,
        screenY,
        button: 2,
        buttons: 2,
      }),
    );
    reroutingContextMenu = false;
  });
}
