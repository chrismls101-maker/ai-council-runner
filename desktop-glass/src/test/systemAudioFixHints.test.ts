import { test } from "node:test";
import assert from "node:assert/strict";
import { systemAudioFixHint, sttFixHint } from "../shared/systemAudioFixHints.ts";

test("each system audio status has user-facing copy", () => {
  assert.match(systemAudioFixHint("requires_permission"), /Screen Recording/i);
  assert.match(systemAudioFixHint("requires_virtual_device"), /virtual device/i);
  assert.match(systemAudioFixHint("unsupported"), /Microphone/i);
});

test("stt fix hints mention server or key", () => {
  assert.match(sttFixHint("missing_key"), /OPENAI_API_KEY/i);
  assert.match(sttFixHint("server_unavailable"), /transcribe-audio/i);
});
