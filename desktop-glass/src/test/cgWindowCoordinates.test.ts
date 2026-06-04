import assert from "node:assert/strict";
import { test } from "node:test";
import { flipCgWindowBoundsToTopLeft, virtualDesktopFrame } from "../shared/cgWindowCoordinates.ts";

test("virtualDesktopFrame spans all displays", () => {
  const frame = virtualDesktopFrame([
    { x: 0, y: 0, width: 1440, height: 900 },
    { x: 1440, y: 0, width: 1920, height: 1080 },
  ]);
  assert.equal(frame.minX, 0);
  assert.equal(frame.minY, 0);
  assert.equal(frame.maxX, 1440 + 1920);
  assert.equal(frame.maxY, 1080);
});

test("flipCgWindowBoundsToTopLeft converts bottom-left CG coords", () => {
  const displays = [{ x: 0, y: 0, width: 1440, height: 900 }];
  const topLeft = flipCgWindowBoundsToTopLeft({ x: 100, y: 100, width: 800, height: 600 }, displays);
  assert.equal(topLeft.x, 100);
  assert.equal(topLeft.width, 800);
  assert.equal(topLeft.height, 600);
  assert.equal(topLeft.y, 200);
});
