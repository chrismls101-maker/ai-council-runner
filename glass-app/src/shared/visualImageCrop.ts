/**
 * Crop region math for visual ask (shared — no Electron).
 */

export interface CropBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type VisualFrameMode = "screen" | "active_window_crop" | "center_crop";

/** Center crop covering `ratio` of width/height (default 65%). */
export function computeCenterCropBounds(
  imageWidth: number,
  imageHeight: number,
  ratio = 0.65,
): CropBounds {
  const w = Math.max(1, Math.round(imageWidth * ratio));
  const h = Math.max(1, Math.round(imageHeight * ratio));
  return {
    x: Math.max(0, Math.round((imageWidth - w) / 2)),
    y: Math.max(0, Math.round((imageHeight - h) / 2)),
    width: Math.min(w, imageWidth),
    height: Math.min(h, imageHeight),
  };
}

/**
 * Map window bounds (screen DIP coords) into capture image pixel coords.
 * Returns null if window does not meaningfully intersect the display.
 */
export function windowBoundsToCaptureCrop(
  window: CropBounds,
  displayBounds: CropBounds,
  imageWidth: number,
  imageHeight: number,
  scaleFactor: number,
): CropBounds | null {
  const scale = scaleFactor > 0 ? scaleFactor : 1;
  const dispW = Math.max(1, Math.round(displayBounds.width * scale));
  const dispH = Math.max(1, Math.round(displayBounds.height * scale));
  const offsetX = Math.round(displayBounds.x * scale);
  const offsetY = Math.round(displayBounds.y * scale);

  const winX = Math.round(window.x * scale) - offsetX;
  const winY = Math.round(window.y * scale) - offsetY;
  const winW = Math.max(1, Math.round(window.width * scale));
  const winH = Math.max(1, Math.round(window.height * scale));

  const x = Math.max(0, winX);
  const y = Math.max(0, winY);
  const right = Math.min(dispW, winX + winW);
  const bottom = Math.min(dispH, winY + winH);
  const width = right - x;
  const height = bottom - y;

  if (width < 48 || height < 48) return null;
  if (width > imageWidth && height > imageHeight) return null;

  return {
    x: Math.min(x, Math.max(0, imageWidth - 1)),
    y: Math.min(y, Math.max(0, imageHeight - 1)),
    width: Math.min(width, imageWidth - x),
    height: Math.min(height, imageHeight - y),
  };
}

export function clampCropToImage(crop: CropBounds, imageWidth: number, imageHeight: number): CropBounds | null {
  const x = Math.max(0, Math.min(crop.x, imageWidth - 1));
  const y = Math.max(0, Math.min(crop.y, imageHeight - 1));
  const width = Math.min(crop.width, imageWidth - x);
  const height = Math.min(crop.height, imageHeight - y);
  if (width < 32 || height < 32) return null;
  return { x, y, width, height };
}
