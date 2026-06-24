import { test } from "node:test";
import assert from "node:assert/strict";
import { systemAudioFixHint, sttFixHint } from "../shared/systemAudioFixHints.ts";

test("each system audio status has user-facing copy", () => {
  assert.match(systemAudioFixHint("requires_permission"), /Screen Recording/i);
  assert.match(systemAudioFixHint("requires_virtual_device"), /virtual audio device/i);
  assert.match(systemAudioFixHint("unsupported"), /Microphone/i);
  assert.match(systemAudioFixHint("source_enumeration_failed"), /Quit and reopen/i);
  assert.match(systemAudioFixHint("not_tested"), /Retry System Audio/i);
});

test("stt fix hints mention server or key", () => {
  assert.match(sttFixHint("missing_key"), /OPENAI_API_KEY/i);
  assert.match(sttFixHint("server_unavailable"), /transcribe-audio/i);
});
