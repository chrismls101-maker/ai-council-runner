import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialTranscriptionState,
  resolveTranscriptionMode,
  transcriptionReducer,
  TRANSCRIPTION_UNAVAILABLE_MESSAGE,
} from "../shared/transcriptionTypes.ts";
import { initialPrivacyState } from "../shared/privacyState.ts";

test("not listening on launch", () => {
  assert.equal(initialPrivacyState.listening, false);
  assert.equal(initialPrivacyState.status, "idle");
});

test("transcription starts idle in manual mode", () => {
  assert.equal(initialTranscriptionState.mode, "manual");
  assert.equal(initialTranscriptionState.status, "idle");
});

test("resolveTranscriptionMode picks mic when web speech available", () => {
  assert.equal(resolveTranscriptionMode(true), "mic_web_speech");
  assert.equal(resolveTranscriptionMode(false), "unavailable");
});

test("start/stop listening transitions", () => {
  let s = transcriptionReducer(initialTranscriptionState, { type: "SET_MODE", mode: "mic_web_speech" });
  s = transcriptionReducer(s, { type: "START_LISTENING" });
  assert.equal(s.status, "listening");
  s = transcriptionReducer(s, { type: "STOP_LISTENING" });
  assert.equal(s.status, "idle");
});

test("unavailable mode message is defined", () => {
  assert.match(TRANSCRIPTION_UNAVAILABLE_MESSAGE, /not available/i);
});

test("unavailable mode cannot start listening", () => {
  const s = transcriptionReducer(
    { ...initialTranscriptionState, mode: "unavailable" },
    { type: "START_LISTENING" },
  );
  assert.equal(s.status, "idle");
});
