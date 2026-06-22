import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";

let clickThroughEnabled = true;
let reroutingContextMenu = false;

/** Overlay uses fixed OS click-through; command bar/dock are always interactive. */
export function syncGlassClickThrough(_enabled: boolean): void {}

/** Interactive overlay surfaces use CSS pointer-events; no runtime OS toggle. */
export function ensureOverlayInteractive(): void {
  clickThroughEnabled = false;
}

/** Reliable wheel scroll inside fixed-height palette lists (Electron overlay). */
export function handlePaletteListWheel(event: ReactWheelEvent<HTMLElement>): void {
  event.stopPropagation();
  const el = event.currentTarget;
  if (el.scrollHeight <= el.clientHeight) return;
  el.scrollTop += event.deltaY;
  event.preventDefault();
}

/** Pointer down on text surfaces — local state only for context-menu rerouting. */
export function prepareGlassTextPointerDown(event: ReactPointerEvent): void {
  if (event.currentTarget.ownerDocument?.body?.classList.contains("glass-body--command")) {
    clickThroughEnabled = false;
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
    clickThroughEnabled = false;
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
