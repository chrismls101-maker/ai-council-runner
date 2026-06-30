import { test } from "node:test";
import assert from "node:assert/strict";
import type { GlassSttState } from "../shared/sttTypes.ts";
import { planDeepgramWhisperFallback } from "../shared/deepgramWhisperFallbackPlan.ts";

const baseStt = { deepgramEnabled: true } as GlassSttState;

test("translate plan stops translate deepgram and disables flag", () => {
  const plan = planDeepgramWhisperFallback("translate", baseStt, false);
  assert.ok(plan);
  assert.equal(plan.stopTranslateDeepgram, true);
  assert.equal(plan.stopCompanionDeepgram, false);
  assert.equal(plan.stopListenDeepgram, false);
  assert.equal(plan.nextStt.deepgramEnabled, false);
  assert.equal(plan.activateTranslateFallback, true);
  assert.equal(plan.activateListenFallback, false);
  assert.equal(plan.activateMeetingsFallback, false);
  assert.equal(plan.activateWatchFallback, false);
});

test("companion plan stops companion session only", () => {
  const plan = planDeepgramWhisperFallback("companion", baseStt, false);
  assert.ok(plan);
  assert.equal(plan.stopTranslateDeepgram, false);
  assert.equal(plan.stopCompanionDeepgram, true);
  assert.equal(plan.stopListenDeepgram, false);
  assert.equal(plan.nextStt.deepgramEnabled, true);
  assert.equal(plan.activateTranslateFallback, false);
  assert.equal(plan.activateListenFallback, false);
  assert.equal(plan.activateMeetingsFallback, false);
  assert.equal(plan.activateWatchFallback, false);
});

test("listen plan stops listen deepgram without disabling global flag", () => {
  const plan = planDeepgramWhisperFallback("listen", baseStt, false);
  assert.ok(plan);
  assert.equal(plan.stopTranslateDeepgram, false);
  assert.equal(plan.stopCompanionDeepgram, false);
  assert.equal(plan.stopListenDeepgram, true);
  assert.equal(plan.nextStt.deepgramEnabled, true);
  assert.equal(plan.activateTranslateFallback, false);
  assert.equal(plan.activateListenFallback, true);
  assert.equal(plan.activateMeetingsFallback, false);
  assert.equal(plan.activateWatchFallback, false);
});

test("meetings plan stops diarization deepgram without disabling global flag", () => {
  const plan = planDeepgramWhisperFallback("meetings", baseStt, false);
  assert.ok(plan);
  assert.equal(plan.stopListenDeepgram, true);
  assert.equal(plan.nextStt.deepgramEnabled, true);
  assert.equal(plan.activateMeetingsFallback, true);
  assert.equal(plan.activateListenFallback, false);
  assert.equal(plan.activateWatchFallback, false);
});

test("watch plan stops diarization deepgram with watch fallback only", () => {
  const plan = planDeepgramWhisperFallback("watch", baseStt, false);
  assert.ok(plan);
  assert.equal(plan.stopListenDeepgram, true);
  assert.equal(plan.activateWatchFallback, true);
  assert.equal(plan.activateListenFallback, false);
  assert.equal(plan.activateMeetingsFallback, false);
});

test("duplicate translate fallback is skipped", () => {
  assert.equal(planDeepgramWhisperFallback("translate", baseStt, true), null);
});
