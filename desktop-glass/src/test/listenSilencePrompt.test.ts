import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LISTEN_SILENCE_DISMISS_COOLDOWN_MS,
  LISTEN_SILENCE_TIMEOUT_MIN,
  shouldShowListenSilencePrompt,
} from "../shared/listenSilencePrompt.ts";

test("brief silence does not show listen no-audio prompt", () => {
  const nowMs = Date.now();
  const show = shouldShowListenSilencePrompt({
    systemAudioActive: true,
    systemAudioLastSignalMs: nowMs - 2 * 60_000,
    nowMs,
    isListenMode: true,
    defaultSilenceTimeoutMin: 5,
  });
  assert.equal(show, false);
});

test("listen no-audio prompt after extended quiet period", () => {
  const nowMs = Date.now();
  const show = shouldShowListenSilencePrompt({
    systemAudioActive: true,
    systemAudioLastSignalMs: nowMs - LISTEN_SILENCE_TIMEOUT_MIN * 60_000 - 1_000,
    nowMs,
    isListenMode: true,
    defaultSilenceTimeoutMin: 5,
  });
  assert.equal(show, true);
});

test("Keep Listening suppresses repeated no-audio prompt", () => {
  const nowMs = Date.now();
  const show = shouldShowListenSilencePrompt({
    systemAudioActive: true,
    systemAudioLastSignalMs: nowMs - LISTEN_SILENCE_TIMEOUT_MIN * 60_000 - 1_000,
    nowMs,
    isListenMode: true,
    defaultSilenceTimeoutMin: 5,
    suppressedUntilMs: nowMs + LISTEN_SILENCE_DISMISS_COOLDOWN_MS,
  });
  assert.equal(show, false);
});
