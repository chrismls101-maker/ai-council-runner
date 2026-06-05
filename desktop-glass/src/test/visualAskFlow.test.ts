import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldCaptureScreenForGlassAsk } from "../shared/glassVisualIntent.ts";

test("visual voice phrase triggers capture-first flow", () => {
  assert.equal(shouldCaptureScreenForGlassAsk("What do you see on my screen?"), true);
  assert.equal(shouldCaptureScreenForGlassAsk("Read this error"), true);
  assert.equal(shouldCaptureScreenForGlassAsk("What matters here?"), false);
});

test("visual ask session persistence uses paths not base64", () => {
  const event = {
    screenshotPath: "/tmp/user/session-screenshots/s1/e1.png",
    thumbnailPath: "/tmp/user/session-screenshots/s1/e1.thumb.png",
    screenshotMimeType: "image/png",
    optimizedWidth: 800,
    optimizedHeight: 600,
    metadata: { compressionApplied: true },
  };
  const json = JSON.stringify({ sessions: [{ events: [event] }] });
  assert.doesNotMatch(json, /data:image/);
  assert.match(json, /screenshotPath/);
  assert.match(json, /optimizedWidth/);
});
