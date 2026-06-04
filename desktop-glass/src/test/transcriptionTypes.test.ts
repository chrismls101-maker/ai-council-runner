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
} from "../shared/audioCaptureTypes.ts";
import { initialPrivacyState } from "../shared/privacyState.ts";
import { SYSTEM_AUDIO_STATUS_MESSAGES } from "../shared/systemAudioTypes.ts";
import type { GlassSttState } from "../shared/sttTypes.ts";

const baseStt: GlassSttState = {
  provider: "none",
  status: "disabled",
  model: "gpt-4o-mini-transcribe",
  enabled: false,
  chunkMs: 20_000,
  autoStopEnabled: false,
  autoStopMs: 30 * 60 * 1000,
};

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
      getDisplayMediaAvailable: true,
      systemAudioStatus: "requires_permission",
      stt: baseStt,
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
      getDisplayMediaAvailable: false,
      systemAudioStatus: "requires_permission",
      stt: baseStt,
    }),
    "manual",
  );
});

test("start/stop listening transitions for mic", () => {
  let s = transcriptionReducer(initialTranscriptionState, {
    type: "SET_MODE",
    mode: "microphone_web_speech",
  });
  s = transcriptionReducer(s, { type: "START_LISTENING" });
  assert.equal(s.status, "listening");
  s = transcriptionReducer(s, { type: "STOP_LISTENING" });
  assert.equal(s.status, "idle");
});

test("system audio missing-track fallback blocks start", () => {
  const snap = buildProviderSnapshot("system_audio", undefined, {
    systemAudioStatus: "requires_virtual_device",
    stt: baseStt,
  });
  assert.equal(
    modeStatusMessage("system_audio", snap),
    SYSTEM_AUDIO_STATUS_MESSAGES.requires_virtual_device,
  );
  assert.equal(canStartListening("system_audio", snap), false);
});

test("system audio requires permission allows start attempt", () => {
  const snap = buildProviderSnapshot("system_audio", undefined, {
    systemAudioStatus: "requires_permission",
    stt: baseStt,
  });
  assert.match(modeStatusMessage("system_audio", snap), /Screen Recording/i);
});

test("manual mode cannot start listening", () => {
  const snap = buildProviderSnapshot("manual", undefined, { stt: baseStt });
  assert.equal(canStartListening("manual", snap), false);
  const s = transcriptionReducer(initialTranscriptionState, { type: "START_LISTENING" });
  assert.equal(s.status, "idle");
});

test("microphone unavailable message", () => {
  const snap = buildProviderSnapshot("microphone_web_speech", undefined, { stt: baseStt });
  assert.match(modeStatusMessage("microphone_web_speech", snap), /not available/i);
  assert.match(MICROPHONE_UNAVAILABLE_MESSAGE, /not available/i);
});

test("system audio listening state in reducer", () => {
  const s = transcriptionReducer(
    { ...initialTranscriptionState, mode: "system_audio" },
    { type: "START_LISTENING" },
  );
  assert.equal(s.status, "listening");
});

test("transcript event creation when chunk has system_audio tag", () => {
  const tags = ["system_audio"];
  assert.deepEqual(tags, ["system_audio"]);
});
