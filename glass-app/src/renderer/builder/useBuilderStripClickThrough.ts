import { useEffect } from "react";

const BUILDER_UI_SELECTOR =
  ".builder-strip, .builder-panel, .builder-panel-host, .aletheia-strip-menu";
const FULLSCREEN_WORKSPACE_SELECTOR =
  ".research-explorer, .code-analyst-explorer, .writing-studio, .glass-storage-projects, .glass-dashboard-shell:not(.glass-dashboard-shell--hidden), .aletheia-dashboard-shell:not(.aletheia-dashboard-shell--hidden)";

function isOverBuilderUi(x: number, y: number): boolean {
  const hit = document.elementFromPoint(x, y);
  return Boolean(hit?.closest(BUILDER_UI_SELECTOR));
}

function isOverFullscreenWorkspace(x: number, y: number): boolean {
  const hit = document.elementFromPoint(x, y);
  return Boolean(hit?.closest(FULLSCREEN_WORKSPACE_SELECTOR));
}

/** Keep overlay OS-interactive while a builder panel is open or pointer is over strip UI. */
export function syncBuilderStripPanelOpen(open: boolean, panel?: string): void {
  window.glass?.setBuilderStripPanelOpen?.(open, panel);
  if (open) {
    window.glass?.setOverlayPointerOverBuilderStrip?.(true);
  }
}

export function syncAletheiaStripMenuOpen(open: boolean): void {
  window.glass?.setAletheiaStripMenuOpen?.(open);
  if (open) {
    window.glass?.setOverlayPointerOverBuilderStrip?.(true);
  }
}

/** Toggle OS overlay interactivity for strip/panel clicks; restore passthrough elsewhere. */
export function useBuilderStripClickThrough(
  activeTab: string | null,
  aletheiaMenuOpen = false,
): void {
  const panelOpen = activeTab !== null;
  const keepOverlayInteractive = panelOpen || aletheiaMenuOpen;

  useEffect(() => {
    syncBuilderStripPanelOpen(panelOpen, activeTab ?? undefined);
  }, [panelOpen, activeTab]);

  useEffect(() => {
    if (aletheiaMenuOpen) {
      armBuilderStripInteractive();
      syncAletheiaStripMenuOpen(true);
    } else {
      syncAletheiaStripMenuOpen(false);
    }
  }, [aletheiaMenuOpen]);

  useEffect(() => {
    let lastPointerOver: boolean | null = null;
    const setPointerOver = (over: boolean): void => {
      if (lastPointerOver === over) return;
      lastPointerOver = over;
      window.glass?.setOverlayPointerOverBuilderStrip?.(over);
    };

    const syncInteractive = (x: number, y: number): void => {
      if (keepOverlayInteractive || isOverFullscreenWorkspace(x, y)) {
        setPointerOver(true);
        return;
      }
      setPointerOver(isOverBuilderUi(x, y));
    };

    const onMove = (event: MouseEvent): void => {
      syncInteractive(event.clientX, event.clientY);
    };

    const onLeave = (): void => {
      if (!keepOverlayInteractive && !document.querySelector(FULLSCREEN_WORKSPACE_SELECTOR)) {
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
  }, [keepOverlayInteractive]);

  // Reset main-process flags only when the strip unmounts — not on tab toggles.
  useEffect(() => {
    return () => {
      syncBuilderStripPanelOpen(false);
      syncAletheiaStripMenuOpen(false);
      window.glass?.setOverlayPointerOverBuilderStrip?.(false);
    };
  }, []);
}

export function armBuilderStripInteractive(): void {
  window.glass?.setOverlayPointerOverBuilderStrip?.(true);
}
