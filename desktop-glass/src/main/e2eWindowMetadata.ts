/**
 * E2E-only BrowserWindow metadata (IIVO_GLASS_E2E=1).
 */

import type { BrowserWindow } from "electron";
import type { GlassE2eWindowMetadata } from "../shared/glassE2eTypes.ts";
import {
  getCommandBarClickThrough,
  getLayoutManager,
  getOverlayClickThrough,
  getWindows,
} from "./windows.ts";

export type { GlassE2eWindowMetadata };

function metadataForWindow(
  name: GlassE2eWindowMetadata["name"],
  win: BrowserWindow | null | undefined,
  ignoreMouseEvents: boolean | null,
): GlassE2eWindowMetadata {
  if (!win || win.isDestroyed()) {
    return {
      name,
      exists: false,
      visible: false,
      bounds: null,
      alwaysOnTop: false,
      focusable: false,
      ignoreMouseEvents: null,
      displayId: null,
    };
  }

  return {
    name,
    exists: true,
    visible: win.isVisible(),
    bounds: win.getBounds(),
    alwaysOnTop: win.isAlwaysOnTop(),
    focusable: win.isFocusable(),
    ignoreMouseEvents,
    displayId: getLayoutManager()?.getDisplay().id ?? null,
  };
}

export function getGlassE2eWindowMetadata(): GlassE2eWindowMetadata[] {
  const windows = getWindows();
  const displayId = getLayoutManager()?.getDisplay().id ?? null;

  if (!windows) {
    return (["overlay", "commandBar", "dock", "panel"] as const).map((name) =>
      metadataForWindow(name, null, null),
    );
  }

  return [
    metadataForWindow("overlay", windows.overlay, getOverlayClickThrough()),
    metadataForWindow("commandBar", windows.commandBar, getCommandBarClickThrough()),
    metadataForWindow("dock", windows.dock, false),
    metadataForWindow("panel", windows.panel, false),
  ].map((entry) => ({ ...entry, displayId }));
}
