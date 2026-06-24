import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampCropToImage,
  computeCenterCropBounds,
  windowBoundsToCaptureCrop,
} from "../shared/visualImageCrop.ts";

test("computeCenterCropBounds returns centered region", () => {
  const crop = computeCenterCropBounds(1920, 1080, 0.65);
  assert.ok(crop.width > 0 && crop.height > 0);
  assert.ok(crop.x >= 0 && crop.y >= 0);
  assert.ok(crop.x + crop.width <= 1920);
  assert.ok(crop.y + crop.height <= 1080);
});

test("windowBoundsToCaptureCrop maps window into display image", () => {
  const crop = windowBoundsToCaptureCrop(
    { x: 100, y: 50, width: 800, height: 600 },
    { x: 0, y: 0, width: 1920, height: 1080 },
    1920,
    1080,
    1,
  );
  assert.ok(crop);
  assert.equal(crop!.x, 100);
  assert.equal(crop!.y, 50);
});

test("windowBoundsToCaptureCrop returns null when window too small", () => {
  const crop = windowBoundsToCaptureCrop(
    { x: 0, y: 0, width: 10, height: 10 },
    { x: 0, y: 0, width: 1920, height: 1080 },
    1920,
    1080,
    1,
  );
  assert.equal(crop, null);
});

test("clampCropToImage rejects tiny crops", () => {
  assert.equal(clampCropToImage({ x: 0, y: 0, width: 8, height: 8 }, 100, 100), null);
});
