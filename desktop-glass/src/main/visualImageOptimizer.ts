/**
 * Downscale/compress/crop visual-ask screenshots before POST /api/glass/ask (Electron main).
 */

import { nativeImage, screen, type NativeImage } from "electron";
import {
  clampCropToImage,
  computeCenterCropBounds,
  windowBoundsToCaptureCrop,
  type CropBounds,
  type VisualFrameMode,
} from "../shared/visualImageCrop.ts";
import {
  chooseVisualFrameMode,
  chooseVisualQualityPreset,
  type VisualQualityPreset,
} from "../shared/visualAskQuality.ts";
import {
  buildVisualImageOptimizeAttempts,
  computeFitDimensions,
  dataUrlPayloadBytes,
  parseVisualImageOptimizerConfig,
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
  visualFrameMode: VisualFrameMode;
  cropBounds?: CropBounds;
  qualityPreset: VisualQualityPreset;
}

export interface VisualOptimizeContext {
  prompt?: string;
  preset?: VisualQualityPreset | "default";
  config?: VisualImageOptimizerConfig;
  displayId?: number;
  windowBounds?: CropBounds;
  retry?: boolean;
}

function qualityPercent(jpegQuality: number): number {
  return Math.round(Math.max(1, Math.min(100, jpegQuality * 100)));
}

function cropImage(image: NativeImage, crop: CropBounds): NativeImage {
  return image.crop({
    x: Math.round(crop.x),
    y: Math.round(crop.y),
    width: Math.round(crop.width),
    height: Math.round(crop.height),
  });
}

function getDisplayCropContext(displayId?: number): {
  displayBounds: CropBounds;
  scaleFactor: number;
} | null {
  const displays = screen.getAllDisplays();
  const display =
    displayId != null ? displays.find((d) => d.id === displayId) : screen.getPrimaryDisplay();
  if (!display) return null;
  const b = display.bounds;
  return {
    displayBounds: { x: b.x, y: b.y, width: b.width, height: b.height },
    scaleFactor: display.scaleFactor || 1,
  };
}

function buildFrameCandidates(
  imageWidth: number,
  imageHeight: number,
  ctx: VisualOptimizeContext,
): { mode: VisualFrameMode; crop: CropBounds | null }[] {
  const prompt = ctx.prompt ?? "";
  const primaryMode = chooseVisualFrameMode(prompt, !!ctx.windowBounds);
  const candidates: { mode: VisualFrameMode; crop: CropBounds | null }[] = [];

  if (primaryMode === "screen") {
    candidates.push({ mode: "screen", crop: null });
    return candidates;
  }

  const disp = getDisplayCropContext(ctx.displayId);
  if (ctx.windowBounds && disp) {
    const mapped = windowBoundsToCaptureCrop(
      ctx.windowBounds,
      disp.displayBounds,
      imageWidth,
      imageHeight,
      disp.scaleFactor,
    );
    if (mapped) {
      candidates.push({ mode: "active_window_crop", crop: mapped });
    }
  }

  const center = clampCropToImage(
    computeCenterCropBounds(imageWidth, imageHeight),
    imageWidth,
    imageHeight,
  );
  if (center) {
    candidates.push({ mode: "center_crop", crop: center });
  }

  candidates.push({ mode: "screen", crop: null });
  return candidates;
}

function encodeAttempt(
  source: NativeImage,
  sourceSize: { width: number; height: number },
  originalSizeBytes: number,
  originalDataUrl: string,
  attempt: { maxWidth: number; maxHeight: number; jpegQuality: number; maxPayloadBytes: number },
  frameMode: VisualFrameMode,
  cropBounds?: CropBounds,
  qualityPreset?: VisualQualityPreset,
): OptimizedVisualImageResult {
  const { width, height } = computeFitDimensions(
    sourceSize.width,
    sourceSize.height,
    attempt.maxWidth,
    attempt.maxHeight,
  );
  const bitmapSize = source.getSize();
  const needsResize = width !== bitmapSize.width || height !== bitmapSize.height;
  const working = needsResize ? source.resize({ width, height, quality: "good" }) : source;
  const outSize = working.getSize();
  const jpegBuffer = working.toJPEG(qualityPercent(attempt.jpegQuality));
  const jpegUrl = `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;
  const optimizedSizeBytes = dataUrlPayloadBytes(jpegUrl);

  return {
    imageDataUrl: jpegUrl,
    mimeType: "image/jpeg",
    originalWidth: sourceSize.width,
    originalHeight: sourceSize.height,
    optimizedWidth: outSize.width,
    optimizedHeight: outSize.height,
    originalSizeBytes,
    optimizedSizeBytes,
    compressionApplied:
      optimizedSizeBytes < originalSizeBytes ||
      outSize.width < sourceSize.width ||
      outSize.height < sourceSize.height ||
      frameMode !== "screen" ||
      !originalDataUrl.startsWith("data:image/jpeg"),
    visualFrameMode: frameMode,
    cropBounds,
    qualityPreset: qualityPreset ?? "general",
  };
}

function optimizeSingleFrame(
  image: NativeImage,
  sourceSize: { width: number; height: number },
  originalSizeBytes: number,
  originalDataUrl: string,
  ctx: VisualOptimizeContext,
  frameMode: VisualFrameMode,
  crop: CropBounds | null,
): OptimizedVisualImageResult {
  const config = ctx.config ?? parseVisualImageOptimizerConfig();
  const qualityPreset = chooseVisualQualityPreset(ctx.prompt ?? "", { retry: ctx.retry });
  const preset =
    ctx.preset === "aggressive"
      ? "aggressive"
      : ctx.preset === "text"
        ? "text"
        : ctx.preset === "general" || ctx.preset === "default"
          ? qualityPreset
          : qualityPreset;

  const working = crop ? cropImage(image, crop) : image;
  const cropSize = working.getSize();
  const attempts = buildVisualImageOptimizeAttempts(config, preset);

  let last: OptimizedVisualImageResult | null = null;
  for (const attempt of attempts) {
    last = encodeAttempt(
      working,
      { width: cropSize.width, height: cropSize.height },
      originalSizeBytes,
      originalDataUrl,
      attempt,
      frameMode,
      crop ?? undefined,
      preset,
    );
    if (last.optimizedSizeBytes <= attempt.maxPayloadBytes) {
      return last;
    }
  }
  return last!;
}

export function optimizeVisualAskImage(
  imageDataUrl: string,
  sourceSize: { width: number; height: number },
  options: VisualOptimizeContext = {},
): OptimizedVisualImageResult {
  const image = nativeImage.createFromDataURL(imageDataUrl);
  const bitmapSize = image.getSize();
  const originalWidth = sourceSize.width > 0 ? sourceSize.width : bitmapSize.width;
  const originalHeight = sourceSize.height > 0 ? sourceSize.height : bitmapSize.height;
  const originalSizeBytes = dataUrlPayloadBytes(imageDataUrl);

  const frameCandidates = buildFrameCandidates(originalWidth, originalHeight, options);
  let best: OptimizedVisualImageResult | null = null;

  for (const { mode, crop } of frameCandidates) {
    const result = optimizeSingleFrame(
      image,
      { width: originalWidth, height: originalHeight },
      originalSizeBytes,
      imageDataUrl,
      options,
      mode,
      crop,
    );
    if (!best || result.optimizedSizeBytes < best.optimizedSizeBytes) {
      best = result;
    }
    const config = options.config ?? parseVisualImageOptimizerConfig();
    const preset = chooseVisualQualityPreset(options.prompt ?? "", { retry: options.retry });
    const cap = buildVisualImageOptimizeAttempts(config, preset)[0]?.maxPayloadBytes ?? config.maxPayloadBytes;
    if (result.optimizedSizeBytes <= cap) {
      return result;
    }
  }

  return best!;
}
