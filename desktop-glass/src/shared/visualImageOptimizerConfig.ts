/**
 * Visual ask image optimizer settings (shared — no Electron).
 */

export interface VisualImageOptimizerConfig {
  maxWidth: number;
  maxHeight: number;
  jpegQuality: number;
  maxPayloadBytes: number;
}

export interface VisualImageOptimizeAttempt {
  maxWidth: number;
  maxHeight: number;
  jpegQuality: number;
  maxPayloadBytes: number;
}

const TEXT_CLARITY_PATTERNS = [
  /\bread this\b/i,
  /\bwhat does this error say\b/i,
  /\bread this error\b/i,
  /\bwhat does this error mean\b/i,
  /\bwhat does the error say\b/i,
];

export function promptNeedsTextClarityVisual(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  return TEXT_CLARITY_PATTERNS.some((pattern) => pattern.test(text));
}

export function parseEnvNumber(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function parseVisualImageOptimizerConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): VisualImageOptimizerConfig {
  return {
    maxWidth: parseEnvNumber(env.IIVO_GLASS_VISUAL_MAX_WIDTH, 1280),
    maxHeight: parseEnvNumber(env.IIVO_GLASS_VISUAL_MAX_WIDTH, 1280),
    jpegQuality: Math.min(1, Math.max(0.1, parseEnvNumber(env.IIVO_GLASS_VISUAL_JPEG_QUALITY, 0.78))),
    maxPayloadBytes: parseEnvNumber(env.IIVO_GLASS_VISUAL_MAX_PAYLOAD_BYTES, 1_500_000),
  };
}

/** Approximate decoded byte size of a data URL payload (base64 segment). */
export function dataUrlPayloadBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  const base64 = dataUrl.slice(comma + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/** Fit inside max box; never upscale. */
export function computeFitDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: Math.min(width || 1, maxWidth), height: Math.min(height || 1, maxHeight) };
  }
  if (width <= maxWidth && height <= maxHeight) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export type VisualImageOptimizePreset = "default" | "aggressive" | "text";

export function buildVisualImageOptimizeAttempts(
  config: VisualImageOptimizerConfig,
  preset: VisualImageOptimizePreset = "default",
): VisualImageOptimizeAttempt[] {
  if (preset === "aggressive") {
    return [
      { maxWidth: 768, maxHeight: 768, jpegQuality: 0.65, maxPayloadBytes: config.maxPayloadBytes },
      { maxWidth: 640, maxHeight: 640, jpegQuality: 0.55, maxPayloadBytes: config.maxPayloadBytes },
    ];
  }

  if (preset === "text") {
    return [
      {
        maxWidth: 1600,
        maxHeight: 1600,
        jpegQuality: 0.85,
        maxPayloadBytes: config.maxPayloadBytes,
      },
      { maxWidth: 1280, maxHeight: 1280, jpegQuality: 0.78, maxPayloadBytes: config.maxPayloadBytes },
      { maxWidth: 1024, maxHeight: 1024, jpegQuality: 0.72, maxPayloadBytes: config.maxPayloadBytes },
      { maxWidth: 768, maxHeight: 768, jpegQuality: 0.65, maxPayloadBytes: config.maxPayloadBytes },
    ];
  }

  return [
    {
      maxWidth: config.maxWidth,
      maxHeight: config.maxHeight,
      jpegQuality: config.jpegQuality,
      maxPayloadBytes: config.maxPayloadBytes,
    },
    {
      maxWidth: 1024,
      maxHeight: 1024,
      jpegQuality: Math.min(config.jpegQuality, 0.72),
      maxPayloadBytes: config.maxPayloadBytes,
    },
    {
      maxWidth: 768,
      maxHeight: 768,
      jpegQuality: 0.65,
      maxPayloadBytes: config.maxPayloadBytes,
    },
  ];
}

export const GLASS_VISUAL_PAYLOAD_TOO_LARGE_MESSAGE =
  "The screen image is still too large to analyze. Try lowering display scaling or use Capture/Open in IIVO.";

export const GLASS_VISUAL_PAYLOAD_RETRY_MESSAGE =
  "Screen image was large — retrying smaller…";
