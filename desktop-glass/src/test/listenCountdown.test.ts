import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LISTEN_START_COUNTDOWN_SECONDS,
  shouldSkipListenCountdown,
} from "../shared/listenCountdown.ts";

test("listen countdown is 10 seconds", () => {
  assert.equal(LISTEN_START_COUNTDOWN_SECONDS, 10);
});

test("shouldSkipListenCountdown skips only fast E2E", () => {
  assert.equal(shouldSkipListenCountdown({ IIVO_GLASS_E2E: "1" }), true);
  assert.equal(
    shouldSkipListenCountdown({ IIVO_GLASS_E2E: "1", IIVO_GLASS_LIVE_E2E: "1" }),
    false,
  );
  assert.equal(shouldSkipListenCountdown({}), false);
});
