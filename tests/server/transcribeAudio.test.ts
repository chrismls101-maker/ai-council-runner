import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAllowedAudioMime,
  MAX_AUDIO_BYTES,
  parseTranscriptionResponse,
  transcribeAudioBuffer,
} from "../../dist/server/transcription/transcribeAudio.js";

test("validates file type", () => {
  assert.equal(isAllowedAudioMime("audio/webm"), true);
  assert.equal(isAllowedAudioMime("video/mp4"), false);
});

test("rejects oversize audio", async () => {
  const prev = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test";
  try {
    await assert.rejects(
      () => transcribeAudioBuffer(Buffer.alloc(MAX_AUDIO_BYTES + 1), "audio/webm"),
      /maximum size/i,
    );
  } finally {
    if (prev) process.env.OPENAI_API_KEY = prev;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("missing key returns configured error", async () => {
  const prev = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(
      () => transcribeAudioBuffer(Buffer.from("abc"), "audio/webm"),
      /OPENAI_API_KEY/i,
    );
  } finally {
    if (prev) process.env.OPENAI_API_KEY = prev;
  }
});

test("stubbed network returns transcript", async () => {
  const prev = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test";
  try {
    const result = await transcribeAudioBuffer(
      Buffer.from("abc"),
      "audio/webm",
      "gpt-4o-mini-transcribe",
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ text: "server transcript" }),
        }) as Response,
    );
    assert.equal(result.text, "server transcript");
    assert.equal(result.provider, "openai");
  } finally {
    if (prev) process.env.OPENAI_API_KEY = prev;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("parse transcription response", () => {
  assert.equal(parseTranscriptionResponse({ text: " hi " }), "hi");
});
