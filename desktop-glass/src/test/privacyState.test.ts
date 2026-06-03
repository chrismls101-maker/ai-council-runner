import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialPrivacyState,
  privacyReducer,
  type PrivacyState,
} from "../shared/privacyState.ts";

test("initial state never captures or listens (safe on launch)", () => {
  assert.equal(initialPrivacyState.status, "idle");
  assert.equal(initialPrivacyState.listening, false);
  assert.equal(initialPrivacyState.capturing, false);
});

test("start listening then pause returns to idle", () => {
  let state: PrivacyState = initialPrivacyState;
  state = privacyReducer(state, { type: "START_LISTENING" });
  assert.equal(state.status, "listening");
  assert.equal(state.listening, true);
  state = privacyReducer(state, { type: "PAUSE" });
  assert.equal(state.status, "idle");
  assert.equal(state.listening, false);
});

test("capture is transient and returns to resting status", () => {
  let state: PrivacyState = privacyReducer(initialPrivacyState, { type: "START_LISTENING" });
  state = privacyReducer(state, { type: "CAPTURE_START" });
  assert.equal(state.status, "capturing");
  assert.equal(state.capturing, true);
  state = privacyReducer(state, { type: "CAPTURE_DONE" });
  assert.equal(state.capturing, false);
  // resting status respects that listening is still on
  assert.equal(state.status, "listening");
});

test("capture done while not listening returns to idle", () => {
  let state: PrivacyState = privacyReducer(initialPrivacyState, { type: "CAPTURE_START" });
  state = privacyReducer(state, { type: "CAPTURE_DONE" });
  assert.equal(state.status, "idle");
});

test("send transitions sending -> sent", () => {
  let state: PrivacyState = privacyReducer(initialPrivacyState, { type: "SEND_START" });
  assert.equal(state.status, "sending");
  state = privacyReducer(state, { type: "SEND_DONE" });
  assert.equal(state.status, "sent");
});

test("stop clears everything", () => {
  let state: PrivacyState = privacyReducer(initialPrivacyState, { type: "START_LISTENING" });
  state = privacyReducer(state, { type: "STOP" });
  assert.deepEqual(state, { ...initialPrivacyState, lastActionAt: undefined });
});

test("reset returns to initial", () => {
  const state = privacyReducer(
    { status: "sent", listening: true, capturing: true },
    { type: "RESET" },
  );
  assert.deepEqual(state, initialPrivacyState);
});
