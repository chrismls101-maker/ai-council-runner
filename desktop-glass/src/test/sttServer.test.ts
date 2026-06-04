import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSttConfig } from "../shared/sttTypes.ts";
import { DEFAULT_CONFIG } from "../shared/config.ts";
import { transcribeViaServer } from "../main/sttServer.ts";

test("Glass prefers server endpoint by default", () => {
  const config = resolveSttConfig({});
  assert.equal(config.endpoint, "server");
});

test("server transcription calls IIVO API", async () => {
  let calledUrl = "";
  const result = await transcribeViaServer(
    DEFAULT_CONFIG,
    "gpt-4o-mini-transcribe",
    { audioPath: await writeTemp(), mimeType: "audio/webm", source: "microphone" },
    async (url, init) => {
      calledUrl = String(url);
      assert.match(calledUrl, /\/api\/transcribe-audio$/);
      assert.equal((init as RequestInit).method, "POST");
      return {
        ok: true,
        status: 200,
        json: async () => ({ text: "hello world", model: "gpt-4o-mini-transcribe" }),
      } as Response;
    },
  );
  assert.match(calledUrl, /transcribe-audio/);
  assert.equal(result.text, "hello world");
  assert.equal(result.endpoint, "server");
});

async function writeTemp(): Promise<string> {
  const { mkdtemp, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(join(tmpdir(), "glass-stt-server-"));
  const path = join(dir, "chunk.webm");
  await writeFile(path, Buffer.from("abc"));
  return path;
}
