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
  assert.equal(plan.nextStt.deepgramEnabled, false);
  assert.equal(plan.activateTranslateFallback, true);
});

test("companion plan stops companion session only", () => {
  const plan = planDeepgramWhisperFallback("companion", baseStt, false);
  assert.ok(plan);
  assert.equal(plan.stopTranslateDeepgram, false);
  assert.equal(plan.stopCompanionDeepgram, true);
  assert.equal(plan.nextStt.deepgramEnabled, true);
  assert.equal(plan.activateTranslateFallback, false);
});

test("duplicate translate fallback is skipped", () => {
  assert.equal(planDeepgramWhisperFallback("translate", baseStt, true), null);
});
