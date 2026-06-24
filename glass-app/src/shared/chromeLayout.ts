/**
 * Chrome layout helpers (dock + command bar placement).
 */

import type { ChromeOrigin } from "./glassSettings.ts";
import type { LayoutRect } from "./glassLayoutMath.ts";

const EDGE_MARGIN = 24;

export function clampChromeOrigin(
  origin: ChromeOrigin,
  size: Pick<LayoutRect, "width" | "height">,
  workArea: LayoutRect,
  margin = EDGE_MARGIN,
): ChromeOrigin {
  const maxX = workArea.x + workArea.width - size.width - margin;
  const maxY = workArea.y + workArea.height - size.height - margin;
  return {
    x: Math.round(Math.max(workArea.x + margin, Math.min(origin.x, maxX))),
    y: Math.round(Math.max(workArea.y + margin, Math.min(origin.y, maxY))),
  };
}

export function resolveChromeWindowBounds<T extends LayoutRect>(
  autoLayout: T,
  customOrigin: ChromeOrigin | null,
  workArea: LayoutRect,
): T {
  if (!customOrigin) return autoLayout;
  const origin = clampChromeOrigin(customOrigin, autoLayout, workArea);
  return { ...autoLayout, x: origin.x, y: origin.y };
}
