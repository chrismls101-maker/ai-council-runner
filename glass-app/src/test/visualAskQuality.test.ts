import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseVisualFrameMode,
  chooseVisualQualityPreset,
  promptNeedsFocusedCrop,
} from "../shared/visualAskQuality.ts";
import { buildVisualImageOptimizeAttempts, parseVisualImageOptimizerConfig } from "../shared/visualImageOptimizerConfig.ts";

test("chooseVisualQualityPreset selects text for error prompts", () => {
  assert.equal(chooseVisualQualityPreset("read this error"), "text");
  assert.equal(chooseVisualQualityPreset("what does this error say"), "text");
  assert.equal(chooseVisualQualityPreset("explain this error"), "text");
});

test("chooseVisualQualityPreset selects general for screen prompts", () => {
  assert.equal(chooseVisualQualityPreset("What's on my screen?"), "general");
});

test("chooseVisualQualityPreset selects aggressive on retry", () => {
  assert.equal(chooseVisualQualityPreset("read this", { retry: true }), "aggressive");
});

test("text preset uses higher long edge under payload cap", () => {
  const config = parseVisualImageOptimizerConfig({});
  const text = buildVisualImageOptimizeAttempts(config, "text")[0];
  assert.equal(text?.maxWidth, 1600);
  assert.equal(text?.jpegQuality, 0.85);
});

test("chooseVisualFrameMode prefers crop for text prompts", () => {
  assert.equal(chooseVisualFrameMode("read this", true), "active_window_crop");
  assert.equal(chooseVisualFrameMode("read this", false), "center_crop");
  assert.equal(chooseVisualFrameMode("what is on screen", false), "screen");
});

test("promptNeedsFocusedCrop matches code error phrasing", () => {
  assert.equal(promptNeedsFocusedCrop("what is this code error"), true);
  assert.equal(promptNeedsFocusedCrop("summarize my day"), false);
});
