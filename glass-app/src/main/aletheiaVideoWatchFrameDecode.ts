/**
 * JPEG → grayscale luma grid for video watch frame diff (Electron main).
 */

import { nativeImage } from "electron";
import {
  registerVideoWatchFrameDecoder,
  VIDEO_WATCH_DIFF_HEIGHT,
  VIDEO_WATCH_DIFF_WIDTH,
} from "../shared/aletheiaVideoWatchMode.ts";

export function decodeWatchFrameToLuma(base64Jpeg: string): Uint8Array | null {
  try {
    const image = nativeImage.createFromBuffer(Buffer.from(base64Jpeg, "base64"));
    if (image.isEmpty()) return null;
    const resized = image.resize({
      width: VIDEO_WATCH_DIFF_WIDTH,
      height: VIDEO_WATCH_DIFF_HEIGHT,
    });
    const bitmap = resized.toBitmap();
    const pixelCount = VIDEO_WATCH_DIFF_WIDTH * VIDEO_WATCH_DIFF_HEIGHT;
    const luma = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;
      const b = bitmap[offset] ?? 0;
      const g = bitmap[offset + 1] ?? 0;
      const r = bitmap[offset + 2] ?? 0;
      luma[i] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
    return luma;
  } catch {
    return null;
  }
}

export function initVideoWatchFrameDecoder(): void {
  registerVideoWatchFrameDecoder(decodeWatchFrameToLuma);
}
