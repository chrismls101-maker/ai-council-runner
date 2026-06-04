import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGlassScreenContextStatus,
  isRecentGlassCapture,
  promptRequestsGlassScreenVisual,
} from "../shared/glassScreenContext.ts";

test("promptRequestsGlassScreenVisual detects screen questions", () => {
  assert.equal(promptRequestsGlassScreenVisual("What's on my screen?"), true);
  assert.equal(promptRequestsGlassScreenVisual("Summarize this screen"), true);
  assert.equal(promptRequestsGlassScreenVisual("What is the capital of France?"), false);
});

test("buildGlassScreenContextStatus none when no capture", () => {
  const status = buildGlassScreenContextStatus(null);
  assert.equal(status.kind, "none");
  assert.match(status.label, /no capture/i);
});

test("buildGlassScreenContextStatus captured with age", () => {
  const capturedAt = new Date(Date.now() - 12_000).toISOString();
  const status = buildGlassScreenContextStatus({
    capturedAt,
    contextUploadStatus: "none",
    displayLabel: "HDMI",
  });
  assert.equal(status.kind, "captured");
  assert.match(status.label, /captured/i);
  assert.ok(status.ageSeconds != null && status.ageSeconds >= 10);
});

test("buildGlassScreenContextStatus looking when phase is looking", () => {
  const status = buildGlassScreenContextStatus(null, { phase: "looking" });
  assert.equal(status.kind, "looking");
  assert.match(status.label, /looking now/i);
});

test("buildGlassScreenContextStatus ready when context uploaded", () => {
  const status = buildGlassScreenContextStatus({
    capturedAt: new Date().toISOString(),
    contextUploadStatus: "ready",
    contextId: "ctx-1",
    displayLabel: "Primary",
  });
  assert.equal(status.kind, "ready");
  assert.match(status.label, /visual ready/i);
});

test("isRecentGlassCapture rejects stale captures", () => {
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  assert.equal(isRecentGlassCapture(old), false);
});
