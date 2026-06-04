import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GLASS_VISUAL_FALLBACK_MAX_AGE_MS,
  isFallbackGlassCapture,
  promptRequestsGlassScreenVisual,
} from "../shared/glassVisualIntent.ts";

test("promptRequestsGlassScreenVisual detects live screen questions", () => {
  assert.equal(promptRequestsGlassScreenVisual("What's on my screen?"), true);
  assert.equal(promptRequestsGlassScreenVisual("What am I working on?"), true);
  assert.equal(promptRequestsGlassScreenVisual("What does this error mean?"), true);
  assert.equal(promptRequestsGlassScreenVisual("Write a short reply."), false);
});

test("isFallbackGlassCapture uses 60 second window", () => {
  const recent = new Date(Date.now() - 30_000).toISOString();
  const stale = new Date(Date.now() - GLASS_VISUAL_FALLBACK_MAX_AGE_MS - 1000).toISOString();
  assert.equal(isFallbackGlassCapture(recent), true);
  assert.equal(isFallbackGlassCapture(stale), false);
});
