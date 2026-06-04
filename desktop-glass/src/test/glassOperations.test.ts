import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAPTURE_PERMISSION_MESSAGE,
  CAPTURE_SUCCESS_MESSAGE,
  STOPPED_MESSAGE,
  captureErrorMessage,
  listeningModeHint,
} from "../shared/glassOperations.ts";
import { privacyReducer, initialPrivacyState } from "../shared/privacyState.ts";
import {
  diagnosticsForCapture,
  recordOperation,
  applyStopAllState,
} from "../shared/glassOperations.ts";

test("captureErrorMessage adds permission guidance", () => {
  const msg = captureErrorMessage(new Error("Screen capture returned an empty image"));
  assert.match(msg, /Screen Recording permission required/);
  assert.match(msg, /System Settings/);
});

test("stopAllActiveCaptureAndListening clears listening state", () => {
  const listening = privacyReducer(initialPrivacyState, {
    type: "START_LISTENING",
    at: new Date().toISOString(),
  });
  assert.equal(listening.listening, true);

  const result = applyStopAllState({
    privacy: listening,
    stt: {
      provider: "openai",
      endpoint: "server",
      status: "configured",
      model: "gpt-4o-mini-transcribe",
      enabled: true,
      chunkMs: 20_000,
      autoStopEnabled: false,
      autoStopMs: 30 * 60 * 1000,
      listeningElapsedMs: 5000,
      transcribing: true,
    },
    diagnostics: recordOperation({ lastCommandStatus: "idle" }, "start-listening", "ok"),
  });

  assert.equal(result.privacy.listening, false);
  assert.equal(result.privacy.capturing, false);
  assert.equal(result.stt.transcribing, false);
  assert.equal(result.stt.listeningElapsedMs, 0);
  assert.equal(result.lastNotice, STOPPED_MESSAGE);
  assert.equal(result.diagnostics.lastCommand, "stop-everything");
});

test("diagnosticsForCapture records success and failure", () => {
  const ok = diagnosticsForCapture({ lastCommandStatus: "idle" }, true);
  assert.equal(ok.captureStatus, "ok");
  assert.equal(ok.lastCommandStatus, "ok");

  const fail = diagnosticsForCapture({ lastCommandStatus: "idle" }, false, "nope");
  assert.equal(fail.captureStatus, "failed");
  assert.equal(fail.lastCommandStatus, "error");
  assert.equal(fail.lastError, "nope");
});

test("listeningModeHint explains chunk and live modes", () => {
  assert.match(listeningModeHint("microphone_web_speech", true), /as you speak/i);
  assert.match(listeningModeHint("microphone_media_recorder", true), /20 second/i);
  assert.match(listeningModeHint("system_audio", true), /System audio/i);
  assert.equal(listeningModeHint("manual", false), "");
});

test("capture success message is user visible copy", () => {
  assert.match(CAPTURE_SUCCESS_MESSAGE, /Screen captured/i);
});
