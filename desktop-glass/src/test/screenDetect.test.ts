import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isFreshScreenContext,
  screenDetectTimeout,
  SCREEN_DETECT_CACHE_MS,
} from "../shared/screenDetect.ts";

test("screenDetectTimeout resolves detect result when faster than limit", async () => {
  const result = await screenDetectTimeout(
    async () => "ok",
    500,
    "fallback",
  );
  assert.equal(result, "ok");
});

test("screenDetectTimeout resolves fallback when detect is slow", async () => {
  const result = await screenDetectTimeout(
    () => new Promise<string>((resolve) => setTimeout(() => resolve("late"), 80)),
    20,
    "fallback",
  );
  assert.equal(result, "fallback");
});

test("screenDetectTimeout resolves fallback when detect rejects", async () => {
  const result = await screenDetectTimeout(
    async () => {
      throw new Error("boom");
    },
    500,
    "fallback",
  );
  assert.equal(result, "fallback");
});

test("isFreshScreenContext respects max age", () => {
  const now = Date.now();
  assert.equal(isFreshScreenContext(now - 1_000, SCREEN_DETECT_CACHE_MS), true);
  assert.equal(isFreshScreenContext(now - SCREEN_DETECT_CACHE_MS - 1, SCREEN_DETECT_CACHE_MS), false);
  assert.equal(isFreshScreenContext(undefined), false);
});
