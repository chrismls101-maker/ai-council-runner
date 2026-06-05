import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifySttFailure,
  sttRetryActionForSource,
  sttSourceErrorMessage,
} from "../shared/sttTypes.ts";

test("classifySttFailure distinguishes no-signal vs transcription vs config vs server", () => {
  assert.equal(classifySttFailure("Audio chunk too small to transcribe."), "no_signal");
  assert.equal(classifySttFailure("OpenAI returned an empty transcript."), "no_signal");
  assert.equal(classifySttFailure("IIVO transcription server unavailable."), "server_unavailable");
  assert.equal(classifySttFailure("Network failure contacting OpenAI transcription API."), "server_unavailable");
  assert.equal(classifySttFailure("Set IIVO_GLASS_OPENAI_API_KEY in root .env"), "config_missing");
  assert.equal(classifySttFailure("OpenAI transcription failed (500): boom"), "transcription_failed");
  assert.equal(classifySttFailure(""), "transcription_failed");
});

test("microphone no-signal message is source-specific", () => {
  const msg = sttSourceErrorMessage("microphone", "no_signal");
  assert.match(msg, /microphone signal/i);
  assert.doesNotMatch(msg, /system audio/i);
});

test("system audio no-signal points at BlackHole/Loopback routing", () => {
  const msg = sttSourceErrorMessage("system_audio", "no_signal");
  assert.match(msg, /system-audio signal/i);
  assert.match(msg, /BlackHole|Loopback/i);
});

test("system audio transcription failure is distinct from no-signal", () => {
  const failed = sttSourceErrorMessage("system_audio", "transcription_failed");
  assert.match(failed, /System audio/i);
  assert.match(failed, /transcription failed/i);
});

test("config-missing message references STT configuration", () => {
  const msg = sttSourceErrorMessage("microphone", "config_missing");
  assert.match(msg, /not configured/i);
  assert.match(msg, /IIVO_GLASS_OPENAI_API_KEY/i);
});

test("server-unavailable message references the transcription server", () => {
  const msg = sttSourceErrorMessage("microphone", "server_unavailable");
  assert.match(msg, /server unavailable|transcription server/i);
});

test("retry action is source-specific", () => {
  assert.equal(sttRetryActionForSource("microphone"), "test-microphone");
  assert.equal(sttRetryActionForSource("system_audio"), "retry-system-audio");
});
