import { test } from "node:test";
import assert from "node:assert/strict";
import { globalScreenToOverlayViewport } from "../shared/aletheiaGhostCursor.ts";

test("globalScreenToOverlayViewport subtracts overlay origin", () => {
  const local = globalScreenToOverlayViewport(420, 310, { x: 0, y: 30 });
  assert.deepEqual(local, { x: 420, y: 280 });
});
