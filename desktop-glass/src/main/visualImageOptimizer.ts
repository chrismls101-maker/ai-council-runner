/**
 * Downscale/compress visual-ask screenshots before POST /api/glass/ask (Electron main).
 */

import { nativeImage } from "electron";
import {
  buildVisualImageOptimizeAttempts,
  computeFitDimensions,
  dataUrlPayloadBytes,
  parseVisualImageOptimizerConfig,
  promptNeedsTextClarityVisual,
  type VisualImageOptimizePreset,
  type VisualImageOptimizerConfig,
} from "../shared/visualImageOptimizerConfig.ts";

export interface OptimizedVisualImageResult {
  imageDataUrl: string;
  mimeType: "image/jpeg";
  originalWidth: number;
  originalHeight: number;
  optimizedWidth: number;
  optimizedHeight: number;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  compressionApplied: boolean;
}

function qualityPercent(jpegQuality: number): number {
  return Math.round(Math.max(1, Math.min(100, jpegQuality * 100)));
}

export function optimizeVisualAskImage(
  imageDataUrl: string,
  sourceSize: { width: number; height: number },
  options: {
    preset?: VisualImageOptimizePreset;
    prompt?: string;
    config?: VisualImageOptimizerConfig;
  } = {},
): OptimizedVisualImageResult {
  const config = options.config ?? parseVisualImageOptimizerConfig();
  const textMode =
    options.preset === "text" ||
    (options.prompt != null && promptNeedsTextClarityVisual(options.prompt));
  const preset: VisualImageOptimizePreset =
    options.preset === "aggressive" ? "aggressive" : textMode ? "text" : (options.preset ?? "default");

  const attempts = buildVisualImageOptimizeAttempts(config, preset);
  const image = nativeImage.createFromDataURL(imageDataUrl);
  const bitmapSize = image.getSize();
  const originalWidth = sourceSize.width > 0 ? sourceSize.width : bitmapSize.width;
  const originalHeight = sourceSize.height > 0 ? sourceSize.height : bitmapSize.height;
  const originalSizeBytes = dataUrlPayloadBytes(imageDataUrl);

  let last: OptimizedVisualImageResult | null = null;

  for (const attempt of attempts) {
    const { width, height } = computeFitDimensions(
      originalWidth,
      originalHeight,
      attempt.maxWidth,
      attempt.maxHeight,
    );
    const needsResize = width !== bitmapSize.width || height !== bitmapSize.height;
    const working = needsResize ? image.resize({ width, height, quality: "good" }) : image;
    const outSize = working.getSize();
    const jpegBuffer = working.toJPEG(qualityPercent(attempt.jpegQuality));
    const jpegUrl = `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;
    const optimizedSizeBytes = dataUrlPayloadBytes(jpegUrl);
    const compressionApplied =
      optimizedSizeBytes < originalSizeBytes ||
      outSize.width < originalWidth ||
      outSize.height < originalHeight ||
      !imageDataUrl.startsWith("data:image/jpeg");

    last = {
      imageDataUrl: jpegUrl,
      mimeType: "image/jpeg",
      originalWidth,
      originalHeight,
      optimizedWidth: outSize.width,
      optimizedHeight: outSize.height,
      originalSizeBytes,
      optimizedSizeBytes,
      compressionApplied,
    };

    if (optimizedSizeBytes <= attempt.maxPayloadBytes) {
      return last;
    }
  }

  return last!;
}
