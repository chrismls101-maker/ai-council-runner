/**
 * Glass Guide — region geometry re-validation (Fix 12).
 *
 * Mapped regions go stale when the window resizes, tabs change, or app state
 * moves. Before any real click at cached coordinates we re-capture the region
 * area and compare it against the crop from mapping time; a large visual diff
 * means the cached geometry can no longer be trusted.
 */

import { nativeImage } from "electron";
import type {
  DisplayBounds,
  OrientationFractionBounds,
} from "../shared/liveOrientationTypes.ts";

/** Cached regions older than this are re-validated before use. */
export const ORIENTATION_REGION_STALE_MS = 90_000;

/** Normalized mean-absolute pixel difference above which a region is considered moved. */
export const ORIENTATION_REGION_DIFF_THRESHOLD = 0.14;

const THUMB_SIZE = 16;

/**
 * Downscaled BGRA thumbnail of a region (fraction bounds) within a full-display
 * screenshot. Null when the image cannot be decoded or the crop is degenerate.
 */
export function regionThumbnail(
  imageDataUrl: string,
  bounds: OrientationFractionBounds,
): Buffer | null {
  try {
    const image = nativeImage.createFromDataURL(imageDataUrl);
    const size = image.getSize();
    if (size.width < 2 || size.height < 2) return null;

    const crop = {
      x: Math.max(0, Math.round(bounds.x * size.width)),
      y: Math.max(0, Math.round(bounds.y * size.height)),
      width: Math.max(1, Math.round(bounds.width * size.width)),
      height: Math.max(1, Math.round(bounds.height * size.height)),
    };
    if (crop.x + crop.width > size.width) crop.width = size.width - crop.x;
    if (crop.y + crop.height > size.height) crop.height = size.height - crop.y;
    if (crop.width < 1 || crop.height < 1) return null;

    return image
      .crop(crop)
      .resize({ width: THUMB_SIZE, height: THUMB_SIZE })
      .toBitmap();
  } catch {
    return null;
  }
}

/** Normalized (0-1) mean absolute difference between two same-size bitmaps. */
export function thumbnailDiff(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 1;
  let total = 0;
  for (let i = 0; i < len; i += 1) {
    total += Math.abs(a[i]! - b[i]!);
  }
  return total / (len * 255);
}

export type RegionValidationInput = {
  region: { bounds: OrientationFractionBounds };
  /** Screenshot from mapping time (null when unavailable — treated as stale). */
  mappedImageDataUrl: string | null;
  mappedAt: number;
  /** Fresh screenshot of the same display. */
  currentImageDataUrl: string;
  now?: number;
};

/**
 * True when the cached region still visually matches the live screen and the
 * cache is fresh enough to click at.
 */
export function isRegionGeometryValid(input: RegionValidationInput): boolean {
  const now = input.now ?? Date.now();
  if (now - input.mappedAt > ORIENTATION_REGION_STALE_MS) {
    // Stale cache still passes when the pixels genuinely match.
    if (!input.mappedImageDataUrl) return false;
  }
  if (!input.mappedImageDataUrl) return true;

  const before = regionThumbnail(input.mappedImageDataUrl, input.region.bounds);
  const after = regionThumbnail(input.currentImageDataUrl, input.region.bounds);
  if (!before || !after) return false;
  return thumbnailDiff(before, after) <= ORIENTATION_REGION_DIFF_THRESHOLD;
}

export type { DisplayBounds };
