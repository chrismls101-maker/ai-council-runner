/**
 * IIVO Glass window layer types (shared — no Electron imports).
 */

export type OverlayMode = "passive" | "insights" | "hidden";

export const OVERLAY_MODES: OverlayMode[] = ["passive", "insights", "hidden"];

export const DEFAULT_OVERLAY_MODE: OverlayMode = "passive";

export function parseOverlayMode(value: string | undefined): OverlayMode {
  const v = (value ?? DEFAULT_OVERLAY_MODE).trim().toLowerCase();
  if (OVERLAY_MODES.includes(v as OverlayMode)) return v as OverlayMode;
  return DEFAULT_OVERLAY_MODE;
}

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GlassWindowState {
  overlayVisible: boolean;
  overlayClickThrough: boolean;
  overlayMode: OverlayMode;
  panelVisible: boolean;
  commandBarVisible: boolean;
  diagnostics: string;
}
