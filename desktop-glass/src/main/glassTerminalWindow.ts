import type { Rectangle } from "electron";
import {
  GLASS_TERMINAL_DEFAULT_HEIGHT,
  GLASS_TERMINAL_DEFAULT_WIDTH,
  GLASS_TERMINAL_REVEAL_MS,
  idealTerminalPanelWidth,
} from "../renderer/dock/glassTerminalLayout.ts";

export { GLASS_TERMINAL_REVEAL_MS };

/** Padding inside the frameless terminal window around the panel chrome. */
export const GLASS_TERMINAL_WINDOW_PADDING_PX = 12;

/** Visual gap between the dock pill window and the terminal window. */
export const GLASS_TERMINAL_DOCK_GAP_PX = 0;

/** Pull the terminal up under the dock window’s bottom chrome padding. */
export const GLASS_TERMINAL_DOCK_OVERLAP_PX = 10;

export function terminalPanelSizeFromWindowBounds(bounds: Rectangle): {
  width: number;
  height: number;
} {
  return {
    width: Math.max(0, bounds.width - GLASS_TERMINAL_WINDOW_PADDING_PX * 2),
    height: Math.max(0, bounds.height - GLASS_TERMINAL_WINDOW_PADDING_PX * 2),
  };
}

export function terminalWindowBoundsBelowDock(
  dockBounds: Rectangle,
  panelWidth = GLASS_TERMINAL_DEFAULT_WIDTH,
  panelHeight = GLASS_TERMINAL_DEFAULT_HEIGHT,
  workArea?: Rectangle,
): Rectangle {
  const pad = GLASS_TERMINAL_WINDOW_PADDING_PX;
  const gap = GLASS_TERMINAL_DOCK_GAP_PX;
  const width = panelWidth + pad * 2;
  const height = panelHeight + pad * 2;
  const dockCenterX = dockBounds.x + dockBounds.width / 2;
  let x = Math.round(dockCenterX - width / 2);
  const y = dockBounds.y + dockBounds.height + gap - GLASS_TERMINAL_DOCK_OVERLAP_PX;

  if (workArea) {
    const edge = 24;
    x = Math.max(
      workArea.x + edge,
      Math.min(x, workArea.x + workArea.width - width - edge),
    );
  }

  return { x, y, width, height };
}
