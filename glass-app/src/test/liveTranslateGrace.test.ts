import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasTranslateMeaningfulCaptionSignal,
  isTranslateHardError,
  isTranslateWaitingCaptionLine,
  isWithinTranslateSilenceGrace,
  shouldSuppressTranslateStartupError,
  TRANSLATE_SILENCE_GRACE_MS,
  TRANSLATE_WAITING_CAPTION,
} from "../shared/liveTranslateGrace.ts";
import { initialLiveTranslateRuntime, startLiveTranslate } from "../shared/liveTranslateState.ts";
import { applyCaptionChunk, initialLiveTranslateCaptions } from "../shared/liveTranslateCaptions.ts";
import { DEFAULT_LIVE_TRANSLATE_CONFIG } from "../shared/liveTranslateConfig.ts";

test("isWithinTranslateSilenceGrace respects startup window", () => {
  const started = startLiveTranslate(initialLiveTranslateRuntime(), { targetLanguage: "en" });
  const t0 = Date.parse(started.lastUpdatedAt!);
  assert.equal(isWithinTranslateSilenceGrace(started, t0), true);
  assert.equal(isWithinTranslateSilenceGrace(started, t0 + TRANSLATE_SILENCE_GRACE_MS - 1), true);
  assert.equal(isWithinTranslateSilenceGrace(started, t0 + TRANSLATE_SILENCE_GRACE_MS), false);
});

test("shouldSuppressTranslateStartupError hides no-audio STT errors during grace", () => {
  const runtime = startLiveTranslate(initialLiveTranslateRuntime(), { targetLanguage: "en" });
  const t0 = Date.parse(runtime.lastUpdatedAt!);
  assert.equal(
    shouldSuppressTranslateStartupError({
      runtime,
      error: "No system-audio signal detected. Confirm output is routed through BlackHole/Loopback and audio is playing.",
      nowMs: t0 + 1_000,
    }),
    true,
  );
  assert.equal(
    shouldSuppressTranslateStartupError({
      runtime,
      error: "Microphone permission denied.",
      nowMs: t0 + 1_000,
    }),
    false,
  );
});

test("waiting caption is not treated as meaningful signal", () => {
  const runtime = startLiveTranslate(initialLiveTranslateRuntime(), { targetLanguage: "en" });
  assert.equal(isTranslateWaitingCaptionLine(runtime.captions.current), false);

  const withWaiting = {
    ...runtime,
    captions: applyCaptionChunk(initialLiveTranslateCaptions(DEFAULT_LIVE_TRANSLATE_CONFIG), {
      original: "",
      translated: TRANSLATE_WAITING_CAPTION,
      interim: true,
      id: "wait",
    }),
  };
  assert.equal(isTranslateWaitingCaptionLine(withWaiting.captions.current), true);
  assert.equal(hasTranslateMeaningfulCaptionSignal(withWaiting), false);
});

test("graceUntilMs covers IPC race before runtime.active", () => {
  const now = Date.now();
  assert.equal(
    shouldSuppressTranslateStartupError({
      error: "System audio captured audio but transcription failed.",
      nowMs: now,
      graceUntilMs: now + 5_000,
    }),
    true,
  );
});

test("isTranslateHardError detects config and permission failures", () => {
  assert.equal(isTranslateHardError("Speech-to-text is not configured."), true);
  assert.equal(isTranslateHardError("Microphone permission denied."), true);
  assert.equal(isTranslateHardError("No system-audio signal detected."), false);
});
