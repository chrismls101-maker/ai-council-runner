import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

let clickThroughEnabled = true;
let reroutingContextMenu = false;

/** Keep renderer click-through state aligned with the command bar window. */
export function syncGlassClickThrough(enabled: boolean): void {
  clickThroughEnabled = enabled;
  window.glass.setIgnoreMouse(enabled);
}

/** Overlay response cards — disable full-screen click-through before clicks land. */
export function ensureOverlayInteractive(): void {
  clickThroughEnabled = false;
  window.glass.setIgnoreMouse(false);
}

/** Disable click-through on pointer down (command bar + overlay text surfaces). */
export function prepareGlassTextPointerDown(event: ReactPointerEvent): void {
  if (event.currentTarget.ownerDocument?.body?.classList.contains("glass-body--command")) {
    syncGlassClickThrough(false);
    return;
  }
  if (event.currentTarget.ownerDocument?.body?.classList.contains("glass-body--overlay")) {
    ensureOverlayInteractive();
  }
}

/** @deprecated use prepareGlassTextPointerDown */
export const prepareGlassTextMouseDown = prepareGlassTextPointerDown;

/** Allow native cut/copy/paste/select-all menus in click-through Glass windows. */
export function prepareGlassTextContextMenu(event: ReactMouseEvent<HTMLElement>): void {
  const onOverlay = event.currentTarget.ownerDocument?.body?.classList.contains("glass-body--overlay");
  const wasClickThrough = clickThroughEnabled;
  if (onOverlay) {
    ensureOverlayInteractive();
  } else {
    syncGlassClickThrough(false);
  }

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
