/**
 * Glass Companion — crop regions from capture for magnifier lens (Phase 4c).
 */

import { nativeImage } from "electron";
import type { GuidanceManifestation, UiMap } from "../shared/companionGuidance.ts";

const MAGNIFIER_TYPES = new Set(["magnifier"]);

function parseDataUrlSize(dataUrl: string): { width: number; height: number } | null {
  try {
    const image = nativeImage.createFromDataURL(dataUrl);
    const size = image.getSize();
    if (size.width <= 0 || size.height <= 0) return null;
    return size;
  } catch {
    return null;
  }
}

export function buildCaptureCropsForManifestations(input: {
  imageDataUrl: string;
  uiMap: UiMap;
  manifestations: GuidanceManifestation[];
  captureWidth?: number;
  captureHeight?: number;
}): Record<string, string> {
  const { imageDataUrl, uiMap, manifestations } = input;
  const bitmapSize = parseDataUrlSize(imageDataUrl);
  if (!bitmapSize) return {};

  const captureWidth = input.captureWidth ?? uiMap.width ?? bitmapSize.width;
  const captureHeight = input.captureHeight ?? uiMap.height ?? bitmapSize.height;
  const scaleX = bitmapSize.width / Math.max(1, captureWidth);
  const scaleY = bitmapSize.height / Math.max(1, captureHeight);

  const markIds = new Set<string>();
  for (const m of manifestations) {
    if (MAGNIFIER_TYPES.has(m.type) && m.targetMarkId) {
      markIds.add(m.targetMarkId);
    }
  }
  if (!markIds.size) return {};

  const image = nativeImage.createFromDataURL(imageDataUrl);
  const crops: Record<string, string> = {};

  for (const markId of markIds) {
    const mark = uiMap.marks.find((m) => m.id === markId);
    if (!mark) continue;
    const pad = 0.02;
    const x = Math.max(0, mark.bounds.x - pad);
    const y = Math.max(0, mark.bounds.y - pad);
    const w = Math.min(1 - x, mark.bounds.w + pad * 2);
    const h = Math.min(1 - y, mark.bounds.h + pad * 2);
    const left = Math.floor(x * captureWidth * scaleX);
    const top = Math.floor(y * captureHeight * scaleY);
    const width = Math.max(24, Math.ceil(w * captureWidth * scaleX));
    const height = Math.max(24, Math.ceil(h * captureHeight * scaleY));
    const cropRect = {
      x: Math.min(left, bitmapSize.width - 1),
      y: Math.min(top, bitmapSize.height - 1),
      width: Math.min(width, bitmapSize.width - left),
      height: Math.min(height, bitmapSize.height - top),
    };
    if (cropRect.width <= 0 || cropRect.height <= 0) continue;
    try {
      const cropped = image.crop(cropRect);
      const jpeg = cropped.toJPEG(82);
      if (jpeg.length) {
        crops[markId] = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
      }
    } catch {
      /* skip bad crop */
    }
  }

  return crops;
}

/** Collect all manifestations from a plan including script steps. */
export function allManifestationsFromPlan(
  manifestations: GuidanceManifestation[],
  steps?: Array<{ manifestations: GuidanceManifestation[] }>,
): GuidanceManifestation[] {
  const out = [...manifestations];
  if (steps?.length) {
    for (const step of steps) {
      out.push(...step.manifestations);
    }
  }
  return out;
}
