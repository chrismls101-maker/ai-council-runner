import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GLASS_ASK_STILL_WORKING_MS,
  GLASS_ASK_TIMEOUT_MS,
  LOOKING_CARD_MIN_MS,
  THINKING_CARD_MIN_MS,
  VOICE_ASK_STATUS,
  firstSentencePreview,
  voiceAskStatusForElapsed,
  waitForMinLookingDuration,
  waitForMinThinkingDuration,
} from "../shared/glassAskTiming.ts";
import { applyStopAllState, recordOperation } from "../shared/glassOperations.ts";
import { privacyReducer, initialPrivacyState } from "../shared/privacyState.ts";

test("voice ask status labels are ordered for UX bridge", () => {
  const order = [
    VOICE_ASK_STATUS.listening,
    VOICE_ASK_STATUS.transcribing,
    VOICE_ASK_STATUS.looking,
    VOICE_ASK_STATUS.thinking,
  ];
  assert.deepEqual(order, ["Listening…", "Transcribing…", "Looking…", "IIVO is thinking…"]);
  assert.match(VOICE_ASK_STATUS.timeout, /longer than expected/i);
});

test("ask timeout is long enough for live GPT but bounded", () => {
  assert.ok(GLASS_ASK_TIMEOUT_MS >= 30_000);
  assert.ok(GLASS_ASK_TIMEOUT_MS <= 60_000);
});

test("status escalates thinking → still working → timeout in order", () => {
  assert.equal(voiceAskStatusForElapsed(0), VOICE_ASK_STATUS.thinking);
  assert.equal(voiceAskStatusForElapsed(0, "looking"), VOICE_ASK_STATUS.looking);
  assert.equal(
    voiceAskStatusForElapsed(GLASS_ASK_STILL_WORKING_MS + 1),
    VOICE_ASK_STATUS.stillWorking,
  );
  assert.equal(
    voiceAskStatusForElapsed(GLASS_ASK_TIMEOUT_MS + 1),
    VOICE_ASK_STATUS.timeout,
  );
  // Still-working threshold sits between phase label and timeout.
  assert.ok(GLASS_ASK_STILL_WORKING_MS < GLASS_ASK_TIMEOUT_MS);
});

test("firstSentencePreview returns the leading sentence as an early preview", () => {
  assert.equal(
    firstSentencePreview("Fix the broken deploy first. Then automate the release."),
    "Fix the broken deploy first.",
  );
  assert.equal(firstSentencePreview("   "), "");
  const long = `${"word ".repeat(60)}done.`;
  const preview = firstSentencePreview(long, 80);
  assert.ok(preview.length <= 81);
  assert.ok(preview.endsWith("…"));
});

test("looking and thinking minimum durations stay in sync band", () => {
  assert.equal(LOOKING_CARD_MIN_MS, THINKING_CARD_MIN_MS);
  assert.ok(THINKING_CARD_MIN_MS >= 250);
  assert.ok(THINKING_CARD_MIN_MS <= 400);
});

test("stop everything clears transcribing state", () => {
  const listening = privacyReducer(initialPrivacyState, {
    type: "START_LISTENING",
    at: new Date().toISOString(),
  });
  const result = applyStopAllState({
    privacy: listening,
    stt: {
      provider: "openai",
      endpoint: "server",
      status: "configured",
      model: "gpt-4o-mini-transcribe",
      enabled: true,
      chunkMs: 20_000,
      autoStopEnabled: false,
      autoStopMs: 30 * 60 * 1000,
      transcribing: true,
      lastError: "I heard audio but transcription failed.",
    },
    diagnostics: recordOperation({ lastCommandStatus: "idle" }, "start-listening", "ok"),
  });
  assert.equal(result.stt.transcribing, false);
  assert.equal(result.stt.lastError, undefined);
  assert.equal(result.privacy.listening, false);
});

test("wait helpers honor minimum card durations", async () => {
  const started = Date.now() - 50;
  await waitForMinLookingDuration(started);
  await waitForMinThinkingDuration(started);
  assert.ok(Date.now() - started >= THINKING_CARD_MIN_MS - 30);
});
