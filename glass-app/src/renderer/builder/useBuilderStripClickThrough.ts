import { useEffect } from "react";

const BUILDER_UI_SELECTOR = ".builder-strip, .builder-panel, .builder-panel-host";
const FULLSCREEN_WORKSPACE_SELECTOR = ".research-explorer, .code-analyst-explorer, .writing-studio";

function isOverBuilderUi(x: number, y: number): boolean {
  const hit = document.elementFromPoint(x, y);
  return Boolean(hit?.closest(BUILDER_UI_SELECTOR));
}

function isOverFullscreenWorkspace(x: number, y: number): boolean {
  const hit = document.elementFromPoint(x, y);
  return Boolean(hit?.closest(FULLSCREEN_WORKSPACE_SELECTOR));
}

/** Keep overlay OS-interactive while a builder panel is open or pointer is over strip UI. */
export function syncBuilderStripPanelOpen(open: boolean): void {
  window.glass?.setBuilderStripPanelOpen?.(open);
  if (open) {
    window.glass?.setOverlayPointerOverBuilderStrip?.(true);
  }
}

/** Toggle OS overlay interactivity for strip/panel clicks; restore passthrough elsewhere. */
export function useBuilderStripClickThrough(panelOpen: boolean): void {
  // Sync panel-open to main immediately when tab state changes — no cleanup that
  // resets on every panelOpen transition (that race made the strip "vanish").
  useEffect(() => {
    syncBuilderStripPanelOpen(panelOpen);
  }, [panelOpen]);

  useEffect(() => {
    const setPointerOver = (over: boolean): void => {
      window.glass?.setOverlayPointerOverBuilderStrip?.(over);
    };

    const syncInteractive = (x: number, y: number): void => {
      if (panelOpen || isOverFullscreenWorkspace(x, y)) {
        setPointerOver(true);
        return;
      }
      setPointerOver(isOverBuilderUi(x, y));
    };

    const onMove = (event: MouseEvent): void => {
      syncInteractive(event.clientX, event.clientY);
    };

    const onLeave = (): void => {
      if (!panelOpen && !document.querySelector(FULLSCREEN_WORKSPACE_SELECTOR)) {
        setPointerOver(false);
      }
    };

    const onPointerDown = (event: PointerEvent): void => {
      syncInteractive(event.clientX, event.clientY);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [panelOpen]);

  // Reset main-process flags only when the strip unmounts — not on tab toggles.
  useEffect(() => {
    return () => {
      syncBuilderStripPanelOpen(false);
      window.glass?.setOverlayPointerOverBuilderStrip?.(false);
    };
  }, []);
}

export function armBuilderStripInteractive(): void {
  window.glass?.setOverlayPointerOverBuilderStrip?.(true);
}
