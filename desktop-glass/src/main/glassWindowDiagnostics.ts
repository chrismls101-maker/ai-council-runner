/**
 * Window diagnostics for IIVO Glass (main process).
 */

import type { BrowserWindow } from "electron";
import type { GlassWindowState, LayoutRect } from "../shared/glassWindowTypes.ts";
import type { DisplayLayoutContext } from "../shared/glassLayoutMath.ts";

function formatRect(label: string, rect: LayoutRect | null, extra = ""): string {
  if (!rect) return `${label}=none`;
  const suffix = extra ? ` ${extra}` : "";
  return `${label}=x${rect.x},y${rect.y},${rect.width}x${rect.height}${suffix}`;
}

export function formatGlassWindowDiagnostics(opts: {
  display: DisplayLayoutContext;
  overlay: LayoutRect | null;
  overlayVisible: boolean;
  overlayClickThrough: boolean;
  dock: LayoutRect | null;
  panel: LayoutRect | null;
  panelVisible: boolean;
}): string {
  const overlayExtra = opts.overlayVisible
    ? opts.overlayClickThrough
      ? "clickThrough=true"
      : "clickThrough=false"
    : "visible=false";
  return [
    `display=id${opts.display.id}`,
    `scale=${opts.display.scaleFactor}`,
    formatRect("bounds", opts.display.bounds),
    formatRect("workArea", opts.display.workArea),
    formatRect("overlay", opts.overlay, overlayExtra),
    formatRect("dock", opts.dock),
    formatRect("panel", opts.panelVisible ? opts.panel : null),
  ].join(" ");
}

export function logGlassWindowDiagnostics(line: string): void {
  console.log(`Glass windows: ${line}`);
}

export function rectFromWindow(win: BrowserWindow | null | undefined): LayoutRect | null {
  if (!win || win.isDestroyed()) return null;
  const b = win.getBounds();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
}

export function buildWindowState(
  diagnostics: string,
  overlayVisible: boolean,
  overlayClickThrough: boolean,
  overlayMode: GlassWindowState["overlayMode"],
  panelVisible: boolean,
): GlassWindowState {
  return {
    overlayVisible,
    overlayClickThrough,
    overlayMode,
    panelVisible,
    diagnostics,
  };
}
