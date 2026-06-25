import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyPersistedAudioState,
  buildAudioPersistencePatch,
} from "../shared/audioStartupPersistence.ts";

test("buildAudioPersistencePatch marks system audio enabled at quit", () => {
  const patch = buildAudioPersistencePatch({
    transcriptionMode: "system_audio",
    systemAudioStatus: "available",
  });
  assert.equal(patch.systemAudioEnabledAtQuit, true);
  assert.equal(patch.persistedTranscriptionMode, "system_audio");
  assert.equal(patch.persistedSystemAudioStatus, "available");
  assert.equal(patch.audioRoutingConfigured, true);
});

test("applyPersistedAudioState restores saved mode and status", () => {
  const target = {
    transcriptionMode: "manual" as const,
    systemAudioStatus: "requires_permission" as const,
  };
  const restored = applyPersistedAudioState(
    {
      systemAudioEnabledAtQuit: true,
      persistedTranscriptionMode: "system_audio",
      persistedSystemAudioStatus: "available",
    },
    target,
  );
  assert.equal(restored, true);
  assert.equal(target.transcriptionMode, "system_audio");
  assert.equal(target.systemAudioStatus, "available");
});

test("buildAudioPersistencePatch clears routing flag when system audio off", () => {
  const patch = buildAudioPersistencePatch({
    transcriptionMode: "manual",
    systemAudioStatus: "requires_permission",
  });
  assert.equal(patch.systemAudioEnabledAtQuit, false);
  assert.equal(patch.audioRoutingConfigured, false);
});

test("applyPersistedAudioState skips when not enabled at quit", () => {
  const target = {
    transcriptionMode: "manual" as const,
    systemAudioStatus: "requires_permission" as const,
  };
  const restored = applyPersistedAudioState(
    {
      systemAudioEnabledAtQuit: false,
      persistedTranscriptionMode: "system_audio",
      persistedSystemAudioStatus: "available",
    },
    target,
  );
  assert.equal(restored, false);
  assert.equal(target.transcriptionMode, "manual");
});
