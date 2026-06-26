import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canActivateListenCapture,
  canActivateMicRecording,
  canActivateScreenCapture,
  canActivateSystemAudioRecording,
  hasTosConsent,
} from "../shared/glassConsentGates.ts";

const allTrue = {
  micAck: true,
  screenAck: true,
  recordingAck: true,
  tosAck: true,
};

test("hasTosConsent requires explicit tosAck", () => {
  assert.equal(hasTosConsent(allTrue), true);
  assert.equal(hasTosConsent({ ...allTrue, tosAck: false }), false);
  assert.equal(hasTosConsent(null), false);
});

test("canActivateMicRecording requires mic + tos", () => {
  assert.equal(canActivateMicRecording(allTrue), true);
  assert.equal(canActivateMicRecording({ micAck: true, tosAck: false }), false);
  assert.equal(canActivateMicRecording({ micAck: false, tosAck: true }), false);
});

test("canActivateScreenCapture requires screen + tos", () => {
  assert.equal(canActivateScreenCapture(allTrue), true);
  assert.equal(canActivateScreenCapture({ screenAck: true, tosAck: false }), false);
});

test("canActivateSystemAudioRecording requires recording + tos", () => {
  assert.equal(canActivateSystemAudioRecording(allTrue), true);
  assert.equal(canActivateSystemAudioRecording({ recordingAck: true, tosAck: false }), false);
});

test("canActivateListenCapture selects mode-specific consent", () => {
  assert.equal(canActivateListenCapture(allTrue, "microphone_media_recorder"), true);
  assert.equal(canActivateListenCapture(allTrue, "system_audio"), true);
  assert.equal(
    canActivateListenCapture({ micAck: true, tosAck: true, recordingAck: false }, "system_audio"),
    false,
  );
  assert.equal(
    canActivateListenCapture({ micAck: false, tosAck: true, recordingAck: true }, "microphone_media_recorder"),
    false,
  );
});
