import { test } from "node:test";
import assert from "node:assert/strict";
import { clampChromeOrigin, resolveChromeWindowBounds } from "../shared/chromeLayout.ts";

test("clampChromeOrigin keeps window inside work area", () => {
  const workArea = { x: 0, y: 0, width: 800, height: 600 };
  const size = { width: 200, height: 80 };
  assert.deepEqual(clampChromeOrigin({ x: 900, y: 700 }, size, workArea), { x: 576, y: 496 });
  assert.deepEqual(clampChromeOrigin({ x: 0, y: 0 }, size, workArea), { x: 24, y: 24 });
});

test("resolveChromeWindowBounds uses custom origin when set", () => {
  const auto = { x: 100, y: 200, width: 300, height: 96 };
  const workArea = { x: 0, y: 0, width: 1440, height: 900 };
  const custom = { x: 400, y: 500 };
  const resolved = resolveChromeWindowBounds(auto, custom, workArea);
  assert.equal(resolved.x, 400);
  assert.equal(resolved.y, 500);
  assert.equal(resolved.width, 300);
});
