import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clearListenModeRuntime,
  hasActiveListenCard,
  initialListenModeRuntime,
  prepareListenModeSession,
} from "../shared/listenModeRuntime.ts";
import { GLASS_MODE_PRESETS } from "../shared/glassModePresets.ts";
import { sessionHasRawAudioOrBase64 } from "../shared/listenLiveHarness.ts";

test("Listen preset requires system audio and not microphone by default", () => {
  const preset = GLASS_MODE_PRESETS.listen;
  assert.equal(preset.preferredInputSource, "system_audio");
  assert.equal(preset.requiresSystemAudio, true);
  assert.equal(preset.activeListeningEnabled, true);
});

test("clearListenModeRuntime resets card, queue, and moments", () => {
  let runtime = initialListenModeRuntime();
  runtime.moments.push({
    id: "m1",
    type: "key_idea",
    summary: "Test",
    transcriptAnchors: ["Test anchor line for runtime reset."],
    firstSeenAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    confidence: 0.8,
    importance: "medium",
    status: "ready",
  });
  runtime.activeCardId = "card-1";
  runtime.activeMomentId = "m1";
  runtime.queuedMomentIds = ["m2"];
  runtime.listenStartedMs = Date.now() - 60_000;

  runtime = clearListenModeRuntime();
  assert.equal(runtime.moments.length, 0);
  assert.equal(runtime.activeCardId, undefined);
  assert.equal(runtime.activeMomentId, undefined);
  assert.deepEqual(runtime.queuedMomentIds, []);
  assert.equal(runtime.listenStartedMs, undefined);
});

test("prepareListenModeSession resets timer and card without clearing moments", () => {
  const now = Date.now();
  let runtime = initialListenModeRuntime();
  runtime.activeCardId = "old";
  runtime.listenStartedMs = now - 300_000;
  runtime.moments = [
    {
      id: "m1",
      type: "key_idea",
      summary: "Keep me",
      transcriptAnchors: ["Keep me"],
      firstSeenAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      confidence: 0.8,
      importance: "medium",
      status: "developing",
    },
  ];
  runtime = prepareListenModeSession(runtime, now);
  assert.equal(runtime.listenStartedMs, now);
  assert.equal(runtime.activeCardId, undefined);
  assert.equal(runtime.moments.length, 1);
});

test("hasActiveListenCard checks feed against runtime activeCardId", () => {
  const runtime = initialListenModeRuntime();
  runtime.activeCardId = "c1";
  assert.equal(
    hasActiveListenCard(runtime, [{ id: "c1", listenMomentId: "m1" }]),
    true,
  );
  assert.equal(hasActiveListenCard(runtime, [{ id: "c2", listenMomentId: "m1" }]), false);
});

test("session JSON must not contain raw audio or base64 payloads", () => {
  const clean = { events: [{ kind: "transcript_note", text: "Hello" }] };
  const dirty = { events: [{ metadata: { imageDataUrl: "data:image/png;base64,abc" } }] };
  assert.equal(sessionHasRawAudioOrBase64(clean), false);
  assert.equal(sessionHasRawAudioOrBase64(dirty), true);
});
