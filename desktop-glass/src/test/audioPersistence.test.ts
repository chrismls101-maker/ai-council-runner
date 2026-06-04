import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionAudioChunkPath, audioExtensionForMime } from "../shared/audioPersistence.ts";

test("audio path generation under userData/session-audio", () => {
  const { fullPath, dir } = sessionAudioChunkPath("/tmp/user", "session-1", "event-1", "webm");
  assert.match(dir, /session-audio\/session-1$/);
  assert.match(fullPath, /event-1\.webm$/);
});

test("audio extension from mime type", () => {
  assert.equal(audioExtensionForMime("audio/webm;codecs=opus"), "webm");
  assert.equal(audioExtensionForMime("audio/ogg"), "ogg");
});
