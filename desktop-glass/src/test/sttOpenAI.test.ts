import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildOpenAITranscriptionFormData,
  parseOpenAITranscriptionResponse,
  transcribeOpenAI,
} from "../main/sttOpenAI.ts";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("OpenAI request builder sets model and file fields", () => {
  const form = buildOpenAITranscriptionFormData(
    { audioPath: "/tmp/a.webm", mimeType: "audio/webm", source: "microphone" },
    Buffer.from("fake-audio"),
  );
  form.set("model", "gpt-4o-mini-transcribe");
  assert.equal(form.get("model"), "gpt-4o-mini-transcribe");
  assert.ok(form.get("file"));
});

test("parseOpenAITranscriptionResponse extracts text", () => {
  assert.equal(parseOpenAITranscriptionResponse({ text: " hello " }), "hello");
  assert.equal(parseOpenAITranscriptionResponse({}), "");
});

test("transcription error handling for empty transcript", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glass-stt-"));
  const audioPath = join(dir, "chunk.webm");
  await writeFile(audioPath, Buffer.from("abc"));
  await assert.rejects(
    () =>
      transcribeOpenAI(
        "sk-test",
        "gpt-4o-mini-transcribe",
        { audioPath, mimeType: "audio/webm", source: "microphone" },
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ text: "   " }),
          }) as Response,
      ),
    /empty transcript/i,
  );
  await rm(dir, { recursive: true, force: true });
});

test("transcription error handling for network failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glass-stt-"));
  const audioPath = join(dir, "chunk.webm");
  await writeFile(audioPath, Buffer.from("abc"));
  await assert.rejects(
    () =>
      transcribeOpenAI(
        "sk-test",
        "gpt-4o-mini-transcribe",
        { audioPath, mimeType: "audio/webm", source: "system_audio" },
        async () => {
          throw new Error("network down");
        },
      ),
    /Network failure/i,
  );
  await rm(dir, { recursive: true, force: true });
});

test("successful provider result returns text", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glass-stt-"));
  const audioPath = join(dir, "chunk.webm");
  await writeFile(audioPath, Buffer.from("abc"));
  const result = await transcribeOpenAI(
    "sk-test",
    "gpt-4o-mini-transcribe",
    { audioPath, mimeType: "audio/webm", source: "system_audio", eventId: "e1" },
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ text: "Meeting notes captured." }),
      }) as Response,
  );
  assert.equal(result.text, "Meeting notes captured.");
  assert.equal(result.provider, "openai");
  await rm(dir, { recursive: true, force: true });
});
