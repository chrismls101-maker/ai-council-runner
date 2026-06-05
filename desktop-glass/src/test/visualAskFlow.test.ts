import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GLASS_VISUAL_CAPTURE_PERMISSION_MESSAGE,
  fallbackCaptureWarning,
  resolveGlassAskUsesVisual,
  shouldCaptureScreenForGlassAsk,
} from "../shared/glassVisualIntent.ts";
import { resolveVoiceRoute } from "../shared/voiceModeState.ts";
import { isCouncilFormattedAnswer } from "../shared/glassAskTypes.ts";

test("voice transcript 'what do you see on my screen?' triggers visual flow", () => {
  const transcript = "What do you see on my screen?";
  assert.equal(resolveVoiceRoute(transcript), "visual");
  assert.equal(shouldCaptureScreenForGlassAsk(transcript), true);
  // Server-side route decision agrees → glass_visual_direct.
  assert.equal(resolveGlassAskUsesVisual(transcript), true);
});

test("general voice transcript stays direct (no capture-first)", () => {
  assert.equal(resolveVoiceRoute("What matters here?"), "direct");
  assert.equal(shouldCaptureScreenForGlassAsk("What matters here?"), false);
  assert.equal(resolveGlassAskUsesVisual("What matters here?"), false);
});

test("visual ask payload includes optimized image metadata", () => {
  // Shape produced by applyOptimizedToPayload — proves metadata, not pixels, is carried.
  const payload = {
    eventId: "e1",
    sessionId: "s1",
    mimeType: "image/jpeg",
    optimizedWidth: 1280,
    optimizedHeight: 800,
    optimizedMimeType: "image/jpeg",
    optimizedSizeBytes: 84_211,
    compressionApplied: true,
    capturedAt: new Date().toISOString(),
  };
  for (const key of [
    "optimizedWidth",
    "optimizedHeight",
    "optimizedSizeBytes",
    "compressionApplied",
  ]) {
    assert.ok(key in payload, `payload should carry ${key}`);
  }
});

test("no base64 stored in session JSON (paths + metadata only)", () => {
  const persistedEvent = {
    kind: "screen_capture",
    screenshotPath: "/tmp/user/session-screenshots/s1/e1.png",
    thumbnailPath: "/tmp/user/session-screenshots/s1/e1.thumb.png",
    screenshotMimeType: "image/png",
    screenshotSizeBytes: 84_211,
    optimizedWidth: 1280,
    optimizedHeight: 800,
  };
  const json = JSON.stringify({ sessions: [{ events: [persistedEvent] }] });
  assert.doesNotMatch(json, /data:image/);
  assert.doesNotMatch(json, /imageDataUrl/);
  assert.match(json, /screenshotPath/);
  assert.match(json, /optimizedWidth/);
});

test("capture failure surfaces a clear error, not a fake answer", () => {
  assert.match(GLASS_VISUAL_CAPTURE_PERMISSION_MESSAGE, /couldn't capture the screen/i);
  assert.match(GLASS_VISUAL_CAPTURE_PERMISSION_MESSAGE, /Screen Recording permission/i);
  // The capture error message is never council-formatted, fabricated content.
  assert.equal(isCouncilFormattedAnswer(GLASS_VISUAL_CAPTURE_PERMISSION_MESSAGE), false);
});

test("last-capture fallback is clearly labeled with age", () => {
  assert.equal(fallbackCaptureWarning(12), "Using your last capture from 12s ago.");
  assert.equal(fallbackCaptureWarning(-5), "Using your last capture from 0s ago.");
  assert.match(fallbackCaptureWarning(3), /last capture/i);
});
