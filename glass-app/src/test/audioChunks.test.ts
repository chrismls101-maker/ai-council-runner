import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CHUNK_MS,
  formatListeningDuration,
  isChunkDurationValid,
  listeningCostWarningMessage,
  shouldAutoStopListening,
  shouldWarnListeningCost,
} from "../shared/audioChunks.ts";

test("default chunk length is 20 seconds", () => {
  assert.equal(DEFAULT_CHUNK_MS, 20_000);
  assert.equal(isChunkDurationValid(DEFAULT_CHUNK_MS), true);
});

test("no recording on launch listening timer starts at zero", () => {
  assert.equal(formatListeningDuration(0), "0:00");
});

test("cost warning at 10 minutes", () => {
  assert.equal(shouldWarnListeningCost(10 * 60 * 1000, false), true);
  assert.equal(shouldWarnListeningCost(10 * 60 * 1000, true), false);
  assert.match(listeningCostWarningMessage(), /10 minutes/i);
});

test("auto-stop default off", () => {
  assert.equal(shouldAutoStopListening(60 * 60 * 1000, false), false);
  assert.equal(shouldAutoStopListening(31 * 60 * 1000, true), true);
});
