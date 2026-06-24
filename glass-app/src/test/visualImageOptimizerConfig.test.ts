import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildVisualImageOptimizeAttempts,
  computeFitDimensions,
  dataUrlPayloadBytes,
  parseVisualImageOptimizerConfig,
  promptNeedsTextClarityVisual,
} from "../shared/visualImageOptimizerConfig.ts";

test("computeFitDimensions preserves aspect ratio and never upscales", () => {
  const fit = computeFitDimensions(3840, 2160, 1280, 1280);
  assert.equal(fit.width, 1280);
  assert.equal(fit.height, 720);

  const small = computeFitDimensions(800, 600, 1280, 1280);
  assert.equal(small.width, 800);
  assert.equal(small.height, 600);
});

test("dataUrlPayloadBytes estimates base64 size", () => {
  const tiny =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const bytes = dataUrlPayloadBytes(tiny);
  assert.ok(bytes > 0 && bytes < 200);
});

test("buildVisualImageOptimizeAttempts includes aggressive and text presets", () => {
  const config = parseVisualImageOptimizerConfig({});
  const aggressive = buildVisualImageOptimizeAttempts(config, "aggressive");
  assert.equal(aggressive[0]?.maxWidth, 768);

  const text = buildVisualImageOptimizeAttempts(config, "text");
  assert.equal(text[0]?.maxWidth, 1600);
});

test("promptNeedsTextClarityVisual detects read-this prompts", () => {
  assert.equal(promptNeedsTextClarityVisual("read this error"), true);
  assert.equal(promptNeedsTextClarityVisual("what is on my screen"), false);
});

test("parseVisualImageOptimizerConfig reads env overrides", () => {
  const config = parseVisualImageOptimizerConfig({
    IIVO_GLASS_VISUAL_MAX_WIDTH: "1024",
    IIVO_GLASS_VISUAL_JPEG_QUALITY: "0.9",
    IIVO_GLASS_VISUAL_MAX_PAYLOAD_BYTES: "900000",
  });
  assert.equal(config.maxWidth, 1024);
  assert.equal(config.jpegQuality, 0.9);
  assert.equal(config.maxPayloadBytes, 900_000);
});
