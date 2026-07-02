/**
 * Glass this — sample the dominant hue/luminance of the screen region behind
 * a card so the surface reads as made from the app beneath it.
 */

import { nativeImage } from "electron";
import type { TextOverlayFractionBounds } from "../shared/textOverlayTypes.ts";

export type SurfaceSample = {
  tint: { h: number; s: number; l: number };
  /** True when the sampled region is light — use the light frosted variant. */
  lightMode: boolean;
};

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Average color of `region` (image fractions) within the screenshot.
 * Returns null when the image cannot be decoded.
 */
export function sampleSurfaceBehindCard(
  imageDataUrl: string,
  region?: TextOverlayFractionBounds,
): SurfaceSample | null {
  try {
    let image = nativeImage.createFromDataURL(imageDataUrl);
    const size = image.getSize();
    if (size.width < 1 || size.height < 1) return null;

    if (region) {
      const crop = {
        x: Math.round(region.left * size.width),
        y: Math.round(region.top * size.height),
        width: Math.max(1, Math.round(region.width * size.width)),
        height: Math.max(1, Math.round(region.height * size.height)),
      };
      if (crop.x + crop.width <= size.width && crop.y + crop.height <= size.height) {
        image = image.crop(crop);
      }
    }

    const pixel = image.resize({ width: 1, height: 1 }).toBitmap();
    if (pixel.length < 3) return null;
    // toBitmap() is BGRA.
    const b = pixel[0]!;
    const g = pixel[1]!;
    const r = pixel[2]!;

    const tint = rgbToHsl(r, g, b);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return { tint, lightMode: luminance > 0.6 };
  } catch {
    return null;
  }
}
