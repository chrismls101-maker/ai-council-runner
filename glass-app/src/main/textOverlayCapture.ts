/**
 * Glass this — screenshot capture for text overlay pipeline.
 */

import { nativeImage, screen } from "electron";
import { captureDisplayById } from "./capture.ts";
import { resolveCaptureDisplay, resolveCaptureDisplayAtPoint } from "./displayRegistry.ts";
import type { GlassDisplayTarget } from "../shared/glassSettings.ts";
import {
  hideGlassWindowsForCapture,
  restoreGlassWindowsAfterCapture,
} from "./windows.ts";
import { computeCenterCropBounds, clampCropToImage, type CropBounds } from "../shared/visualImageCrop.ts";

const CAPTURE_HIDE_SETTLE_MS = 150;

export type TextOverlayCaptureMode = "full" | "cursor_crop" | "center_third";

function cropAroundCursor(
  imageDataUrl: string,
  cursorX: number,
  cursorY: number,
  displayBounds: CropBounds,
  cropWidth = 600,
  cropHeight = 300,
): { imageDataUrl: string; cropRect: CropBounds } {
  const image = nativeImage.createFromDataURL(imageDataUrl);
  const size = image.getSize();
  const scaleX = size.width / Math.max(1, displayBounds.width);
  const scaleY = size.height / Math.max(1, displayBounds.height);

  const relX = (cursorX - displayBounds.x) * scaleX;
  const relY = (cursorY - displayBounds.y) * scaleY;
  const w = Math.min(cropWidth * scaleX, size.width);
  const h = Math.min(cropHeight * scaleY, size.height);

  const crop = clampCropToImage(
    {
      x: relX - w / 2,
      y: relY - h / 2,
      width: w,
      height: h,
    },
    size.width,
    size.height,
  );
  if (!crop) return { imageDataUrl, cropRect: displayBounds };

  const cropped = image.crop({
    x: Math.round(crop.x),
    y: Math.round(crop.y),
    width: Math.round(crop.width),
    height: Math.round(crop.height),
  }).toDataURL();

  return {
    imageDataUrl: cropped,
    cropRect: {
      x: displayBounds.x + crop.x / scaleX,
      y: displayBounds.y + crop.y / scaleY,
      width: crop.width / scaleX,
      height: crop.height / scaleY,
    },
  };
}

function cropCenterThird(
  imageDataUrl: string,
  displayBounds: CropBounds,
): { imageDataUrl: string; cropRect: CropBounds } {
  const image = nativeImage.createFromDataURL(imageDataUrl);
  const size = image.getSize();
  const scaleX = size.width / Math.max(1, displayBounds.width);
  const scaleY = size.height / Math.max(1, displayBounds.height);
  const crop = computeCenterCropBounds(size.width, size.height, 0.33);
  const cropped = image.crop({
    x: crop.x,
    y: crop.y,
    width: crop.width,
    height: crop.height,
  }).toDataURL();
  return {
    imageDataUrl: cropped,
    cropRect: {
      x: displayBounds.x + crop.x / scaleX,
      y: displayBounds.y + crop.y / scaleY,
      width: crop.width / scaleX,
      height: crop.height / scaleY,
    },
  };
}

export async function captureForTextOverlay(input: {
  displayTarget: GlassDisplayTarget;
  mode: TextOverlayCaptureMode;
  cursorX?: number;
  cursorY?: number;
  /** When false, capture without hiding Glass windows (Glass Guide — avoids chrome flicker). */
  hideGlassChrome?: boolean;
}): Promise<{ imageDataUrl: string; displayBounds: CropBounds; cropRect: CropBounds } | null> {
  if (process.env.IIVO_GLASS_E2E === "1") {
    return {
      imageDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8/BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      displayBounds: { x: 0, y: 0, width: 1, height: 1 },
      cropRect: { x: 0, y: 0, width: 1, height: 1 },
    };
  }

  try {
    const target =
      input.cursorX != null && input.cursorY != null
        ? resolveCaptureDisplayAtPoint(input.cursorX, input.cursorY)
        : resolveCaptureDisplay(input.displayTarget);
    const hideChrome = input.hideGlassChrome !== false;
    if (hideChrome) {
      await hideGlassWindowsForCapture();
      await new Promise((r) => setTimeout(r, CAPTURE_HIDE_SETTLE_MS));
    }

    const capture = await captureDisplayById(target.id, target.label);
    let imageDataUrl = capture.imageDataUrl;

    const display =
      screen.getAllDisplays().find((d) => d.id === target.id)
      ?? screen.getPrimaryDisplay();
    const displayBounds: CropBounds = {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
    };

    let cropRect: CropBounds = displayBounds;
    if (input.mode === "cursor_crop" && input.cursorX != null && input.cursorY != null) {
      const result = cropAroundCursor(
        imageDataUrl,
        input.cursorX,
        input.cursorY,
        displayBounds,
      );
      imageDataUrl = result.imageDataUrl;
      cropRect = result.cropRect;
    } else if (input.mode === "center_third") {
      const result = cropCenterThird(imageDataUrl, displayBounds);
      imageDataUrl = result.imageDataUrl;
      cropRect = result.cropRect;
    }

    return { imageDataUrl, displayBounds, cropRect };
  } catch {
    return null;
  } finally {
    if (input.hideGlassChrome !== false) {
      restoreGlassWindowsAfterCapture();
    }
  }
}
