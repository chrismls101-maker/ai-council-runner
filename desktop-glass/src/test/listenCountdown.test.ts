import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LISTEN_START_COUNTDOWN_SECONDS,
  shouldSkipListenCountdown,
} from "../shared/listenCountdown.ts";

test("listen countdown is disabled (immediate start)", () => {
  assert.equal(LISTEN_START_COUNTDOWN_SECONDS, 0);
});

test("shouldSkipListenCountdown always skips countdown", () => {
  assert.equal(shouldSkipListenCountdown({ IIVO_GLASS_E2E: "1" }), true);
  assert.equal(
    shouldSkipListenCountdown({ IIVO_GLASS_E2E: "1", IIVO_GLASS_LIVE_E2E: "1" }),
    true,
  );
  assert.equal(shouldSkipListenCountdown({}), true);
});
