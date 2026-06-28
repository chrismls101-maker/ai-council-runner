import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";

let clickThroughEnabled = true;
let reroutingContextMenu = false;

/** Overlay uses fixed OS click-through; command bar/dock are always interactive. */
export function syncGlassClickThrough(_enabled: boolean): void {}

/** Interactive overlay surfaces use CSS pointer-events; keep OS overlay interactive. */
export function ensureOverlayInteractive(): void {
  clickThroughEnabled = false;
  window.glass?.setOverlayPointerOverBuilderStrip?.(true);
}

/** Research Explorer — full-screen overlay must capture clicks and keyboard. */
export function armResearchOverlayPointer(): void {
  clickThroughEnabled = false;
  window.glass?.setOverlayPointerOverBuilderStrip?.(true);
  window.glass?.notifyResearchExplorerMounted?.();
}

/** Code Analyst workspace — full-screen overlay must capture clicks and keyboard. */
export function armCodeAnalystOverlayPointer(): void {
  clickThroughEnabled = false;
  window.glass?.setOverlayPointerOverBuilderStrip?.(true);
  window.glass?.notifyCodeAnalystExplorerMounted?.();
}

/** Writing Studio — full-screen overlay must capture clicks and keyboard. */
export function armWritingStudioOverlayPointer(): void {
  clickThroughEnabled = false;
  window.glass?.setOverlayPointerOverBuilderStrip?.(true);
  window.glass?.notifyWritingStudioMounted?.();
}

/** Glass Dashboard — full-screen overlay must capture clicks and keyboard. */
export function armDashboardOverlayPointer(): void {
  clickThroughEnabled = false;
  window.glass?.setOverlayPointerOverBuilderStrip?.(true);
  window.glass?.notifyGlassDashboardMounted?.();
}

/** Aletheia Dashboard — full-screen overlay must capture clicks and keyboard. */
export function armAletheiaDashboardOverlayPointer(): void {
  clickThroughEnabled = false;
  window.glass?.setOverlayPointerOverBuilderStrip?.(true);
  window.glass?.notifyAletheiaDashboardMounted?.();
}

/** Glass Storage Projects — full-screen overlay must capture clicks; keyboard only when focused in. */
export function armGlassStorageProjectsOverlayPointer(focusKeyboard = false): void {
  clickThroughEnabled = false;
  window.glass?.setOverlayPointerOverBuilderStrip?.(true);
  window.glass?.notifyGlassStorageProjectsMounted?.(focusKeyboard);
}

/** Glass IDE + embedded terminal — keep the full-screen overlay OS-interactive. */
export function armIdeOverlayPointer(): void {
  ensureOverlayInteractive();
  window.glass?.setOverlayPointerOverIde?.(true);
}

/** Reliable wheel scroll inside fixed-height palette lists (Electron overlay). */
export function handlePaletteListWheel(event: ReactWheelEvent<HTMLElement>): void {
  event.stopPropagation();
  const el = event.currentTarget;
  if (el.scrollHeight <= el.clientHeight) return;
  el.scrollTop += event.deltaY;
  event.preventDefault();
}

/** Pointer down on text surfaces — keep overlay OS-interactive for typing. */
export function prepareGlassTextPointerDown(event: ReactPointerEvent): void {
  const target = event.currentTarget as HTMLElement;
  if (target.closest(".research-explorer")) {
    armResearchOverlayPointer();
    return;
  }
  if (target.closest(".code-analyst-explorer")) {
    armCodeAnalystOverlayPointer();
    return;
  }
  if (target.closest(".writing-studio")) {
    armWritingStudioOverlayPointer();
    return;
  }
  if (target.closest(".glass-dashboard-shell")) {
    armDashboardOverlayPointer();
    return;
  }
  if (target.closest(".aletheia-dashboard-shell")) {
    armAletheiaDashboardOverlayPointer();
    return;
  }
  if (target.closest(".glass-storage-projects")) {
    armGlassStorageProjectsOverlayPointer(true);
    return;
  }
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
