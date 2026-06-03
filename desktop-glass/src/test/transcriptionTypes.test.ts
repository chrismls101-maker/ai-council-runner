import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canStartListening,
  detectWebSpeech,
  resolveMicrophoneMode,
  modeStatusMessage,
  buildProviderSnapshot,
} from "../shared/transcriptionProviders.ts";
import {
  initialTranscriptionState,
  transcriptionReducer,
} from "../shared/transcriptionTypes.ts";
import {
  MICROPHONE_UNAVAILABLE_MESSAGE,
  SYSTEM_AUDIO_UNAVAILABLE_MESSAGE,
} from "../shared/audioCaptureTypes.ts";
import { initialPrivacyState } from "../shared/privacyState.ts";

test("not listening on launch", () => {
  assert.equal(initialPrivacyState.listening, false);
  assert.equal(initialPrivacyState.status, "idle");
  assert.equal(initialTranscriptionState.status, "idle");
});

test("mode detection picks web speech when available", () => {
  const fakeWin = {
    SpeechRecognition: function SpeechRecognition() {},
  } as unknown as Window;
  assert.equal(detectWebSpeech(fakeWin), true);
  assert.equal(
    resolveMicrophoneMode({
      webSpeechAvailable: true,
      mediaRecorderAvailable: true,
      getUserMediaAvailable: true,
    }),
    "microphone_web_speech",
  );
});

test("unavailable fallback when no mic providers", () => {
  assert.equal(
    resolveMicrophoneMode({
      webSpeechAvailable: false,
      mediaRecorderAvailable: false,
      getUserMediaAvailable: false,
    }),
    "manual",
  );
});

test("start/stop listening transitions", () => {
  let s = transcriptionReducer(initialTranscriptionState, {
    type: "SET_MODE",
    mode: "microphone_web_speech",
  });
  s = transcriptionReducer(s, { type: "START_LISTENING" });
  assert.equal(s.status, "listening");
  s = transcriptionReducer(s, { type: "STOP_LISTENING" });
  assert.equal(s.status, "idle");
});

test("system audio unavailable warning", () => {
  const snap = buildProviderSnapshot("system_audio_unavailable");
  assert.equal(modeStatusMessage("system_audio_unavailable", snap), SYSTEM_AUDIO_UNAVAILABLE_MESSAGE);
  assert.equal(canStartListening("system_audio_unavailable", snap), false);
});

test("manual mode cannot start listening", () => {
  const snap = buildProviderSnapshot("manual");
  assert.equal(canStartListening("manual", snap), false);
  const s = transcriptionReducer(initialTranscriptionState, { type: "START_LISTENING" });
  assert.equal(s.status, "idle");
});

test("microphone unavailable message", () => {
  const snap = buildProviderSnapshot("microphone_web_speech", undefined);
  assert.match(modeStatusMessage("microphone_web_speech", snap), /not available/i);
  assert.match(MICROPHONE_UNAVAILABLE_MESSAGE, /not available/i);
});

test("transcript chunk mode allows listening only for mic modes", () => {
  const s = transcriptionReducer(
    { ...initialTranscriptionState, mode: "microphone_web_speech" },
    { type: "START_LISTENING" },
  );
  assert.equal(s.status, "listening");
});
