import { test } from "node:test";
import assert from "node:assert/strict";
import {
  displayIdContainingPoint,
  shouldRelayoutForDisplayChange,
} from "../shared/displayTargetMath.ts";
import { FOLLOW_MOUSE_POLL_MS } from "../shared/displayTargetMath.ts";

const displays = [
  { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
  { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } },
];

test("displayIdContainingPoint selects display under cursor", () => {
  assert.equal(displayIdContainingPoint({ x: 100, y: 100 }, displays), 1);
  assert.equal(displayIdContainingPoint({ x: 2000, y: 100 }, displays), 2);
});

test("displayIdContainingPoint falls back to primary id", () => {
  assert.equal(displayIdContainingPoint({ x: -50, y: -50 }, displays, 1), 1);
});

test("shouldRelayoutForDisplayChange only when id changes", () => {
  assert.equal(shouldRelayoutForDisplayChange(null, 1), true);
  assert.equal(shouldRelayoutForDisplayChange(1, 1), false);
  assert.equal(shouldRelayoutForDisplayChange(1, 2), true);
});

test("follow mouse poll interval is throttled", () => {
  assert.ok(FOLLOW_MOUSE_POLL_MS >= 500);
  assert.ok(FOLLOW_MOUSE_POLL_MS <= 1000);
});
