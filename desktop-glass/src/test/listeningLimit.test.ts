import { test } from "node:test";
import assert from "node:assert/strict";

import { parseMaxListeningMin } from "../shared/copilotConfig.ts";
import {
  createListeningLimitState,
  extendListeningLimit,
  isListeningLimitEnabled,
  LISTENING_LIMIT_CONTINUE_MIN,
  LISTENING_LIMIT_RESPONSE_TIMEOUT_MS,
  markListeningLimitReached,
  resetListeningLimitState,
  shouldAutoStopListeningLimit,
  shouldTriggerListeningLimit,
} from "../shared/listeningLimit.ts";
import { GlassSessionStore } from "../shared/sessionStore.ts";

test("max listening disabled when set to 0 or off", () => {
  assert.equal(parseMaxListeningMin(0), 0);
  assert.equal(parseMaxListeningMin("off"), 0);
  assert.equal(isListeningLimitEnabled(0), false);
  assert.equal(
    shouldTriggerListeningLimit({
      elapsedMs: 999_999_999,
      maxListeningMin: 0,
      extensionMs: 0,
      limitReached: false,
      listening: true,
    }),
    false,
  );
});

test("timer does not run on app launch (not listening)", () => {
  assert.equal(
    shouldTriggerListeningLimit({
      elapsedMs: 120 * 60_000,
      maxListeningMin: 60,
      extensionMs: 0,
      limitReached: false,
      listening: false,
    }),
    false,
  );
});

test("limit triggers only after configured duration while listening", () => {
  const maxMin = 2;
  const limitMs = maxMin * 60_000;
  assert.equal(
    shouldTriggerListeningLimit({
      elapsedMs: limitMs - 1,
      maxListeningMin: maxMin,
      extensionMs: 0,
      limitReached: false,
      listening: true,
    }),
    false,
  );
  assert.equal(
    shouldTriggerListeningLimit({
      elapsedMs: limitMs,
      maxListeningMin: maxMin,
      extensionMs: 0,
      limitReached: false,
      listening: true,
    }),
    true,
  );
});

test("limit reached creates card state", () => {
  let state = createListeningLimitState();
  assert.equal(state.limitReached, false);
  state = markListeningLimitReached(state, 10_000);
  assert.equal(state.limitReached, true);
  assert.equal(state.limitReachedAtMs, 10_000);
});

test("continue extends allowed duration and clears card", () => {
  let state = markListeningLimitReached(createListeningLimitState(), 5_000);
  state = extendListeningLimit(state);
  assert.equal(state.limitReached, false);
  assert.equal(state.limitReachedAtMs, undefined);
  assert.equal(state.extensionMs, LISTENING_LIMIT_CONTINUE_MIN * 60_000);
  // Still listening at prior elapsed — should not re-trigger until extension exhausted.
  assert.equal(
    shouldTriggerListeningLimit({
      elapsedMs: 120 * 60_000,
      maxListeningMin: 120,
      extensionMs: state.extensionMs,
      limitReached: false,
      listening: true,
    }),
    false,
  );
});

test("reset clears timer state (Stop Everything path)", () => {
  let state = markListeningLimitReached(createListeningLimitState(), Date.now());
  state = extendListeningLimit(state);
  state = resetListeningLimitState();
  assert.deepEqual(state, createListeningLimitState());
});

test("auto-stop fires after response timeout with no user action", () => {
  const state = markListeningLimitReached(createListeningLimitState(), 1_000);
  assert.equal(shouldAutoStopListeningLimit(state, 1_000 + LISTENING_LIMIT_RESPONSE_TIMEOUT_MS - 1), false);
  assert.equal(shouldAutoStopListeningLimit(state, 1_000 + LISTENING_LIMIT_RESPONSE_TIMEOUT_MS), true);
});

test("60-minute limit does not fire at 3 minutes", () => {
  assert.equal(
    shouldTriggerListeningLimit({
      elapsedMs: 3 * 60_000,
      maxListeningMin: 60,
      extensionMs: 0,
      limitReached: false,
      listening: true,
    }),
    false,
  );
});

test("fresh Listen session starts at 0 elapsed — stale elapsed above 1.5x limit is ignored", () => {
  const maxMin = 120;
  const staleElapsed = maxMin * 60_000 * 2;
  assert.equal(isListeningLimitEnabled(maxMin), true);
  assert.equal(
    shouldTriggerListeningLimit({
      elapsedMs: staleElapsed,
      maxListeningMin: maxMin,
      extensionMs: 0,
      limitReached: false,
      listening: true,
    }),
    true,
  );
  assert.equal(
    shouldTriggerListeningLimit({
      elapsedMs: 0,
      maxListeningMin: maxMin,
      extensionMs: 0,
      limitReached: false,
      listening: true,
    }),
    false,
  );
});

test("session event listening_limit_reached is saved", () => {
  const store = new GlassSessionStore();
  store.startSession("Limit test");
  const event = store.addEvent({
    kind: "listening_limit_reached",
    title: "Listening limit reached",
    text: "Max listening duration (60 min) reached.",
  });
  assert.ok(event);
  assert.equal(store.current()?.events.at(-1)?.kind, "listening_limit_reached");
});
