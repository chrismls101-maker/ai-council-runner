import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAttemptSystemAudioCapture,
  mapSystemAudioCaptureError,
  mapSystemAudioStreamResult,
  resolveInitialSystemAudioStatus,
  stopMediaStreamState,
  systemAudioListeningMessage,
} from "../shared/systemAudioCapture.ts";
import { SYSTEM_AUDIO_STATUS_MESSAGES } from "../shared/systemAudioTypes.ts";

test("system audio status detection on macOS 13+", () => {
  assert.equal(resolveInitialSystemAudioStatus("darwin", 22), "requires_permission");
  assert.equal(resolveInitialSystemAudioStatus("darwin", 21), "unsupported");
});

test("system audio status detection on Windows/Linux", () => {
  assert.equal(resolveInitialSystemAudioStatus("win32"), "requires_permission");
  assert.equal(resolveInitialSystemAudioStatus("linux"), "requires_permission");
});

test("unsupported fallback on unknown platform", () => {
  assert.equal(resolveInitialSystemAudioStatus("freebsd"), "unsupported");
});

test("requires virtual device when stream has no audio on macOS", () => {
  assert.equal(mapSystemAudioStreamResult(0, "darwin"), "requires_virtual_device");
  assert.equal(mapSystemAudioStreamResult(1, "darwin"), "available");
});

test("permission error maps to requires_permission", () => {
  const mapped = mapSystemAudioCaptureError(new DOMException("denied", "NotAllowedError"));
  assert.equal(mapped.status, "requires_permission");
});

test("requires virtual device message", () => {
  assert.match(
    SYSTEM_AUDIO_STATUS_MESSAGES.requires_virtual_device,
    /virtual audio device/i,
  );
});

test("stop listening clears stream state", () => {
  let stopped = 0;
  const result = stopMediaStreamState([{ stop: () => { stopped += 1; } }, { stop: () => { stopped += 1; } }]);
  assert.equal(stopped, 2);
  assert.equal(result.streamActive, false);
  assert.equal(result.trackCount, 0);
});

test("can attempt capture when permission may be grantable", () => {
  assert.equal(canAttemptSystemAudioCapture("requires_permission"), true);
  assert.equal(canAttemptSystemAudioCapture("source_enumeration_failed"), true);
  assert.equal(canAttemptSystemAudioCapture("not_tested"), true);
  assert.equal(canAttemptSystemAudioCapture("unsupported"), false);
  assert.equal(canAttemptSystemAudioCapture("requires_virtual_device"), false);
});

test("listening message when capture active", () => {
  assert.match(
    systemAudioListeningMessage("available", true),
    /Transcription provider not connected/i,
  );
});
