import { test } from "node:test";
import assert from "node:assert/strict";
import { THINKING_CARD_MIN_MS, waitForMinThinkingDuration } from "../shared/glassAskTiming.ts";

test("thinking card minimum duration is 250-400ms band", () => {
  assert.ok(THINKING_CARD_MIN_MS >= 250);
  assert.ok(THINKING_CARD_MIN_MS <= 400);
});

test("waitForMinThinkingDuration waits remaining time", async () => {
  const started = Date.now() - 100;
  await waitForMinThinkingDuration(started);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= THINKING_CARD_MIN_MS - 20);
});
