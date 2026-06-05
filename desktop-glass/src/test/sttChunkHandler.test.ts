import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_CONFIG } from "../shared/config.ts";
import {
  STT_TRANSCRIPTION_FAILED_MESSAGE,
  buildGlassSttState,
  resolveSttConfig,
} from "../shared/sttTypes.ts";
import { processSttChunk } from "../main/sttChunkHandler.ts";
import { transcribeWithProvider } from "../main/sttProvider.ts";
import type { GlassSessionStore } from "../shared/sessionStore.ts";

function mockSessionStore(): GlassSessionStore {
  return {
    current: () => ({ id: "s1", status: "active", events: [], createdAt: "", updatedAt: "" }),
    addEvent: () => {},
  } as unknown as GlassSessionStore;
}

async function writeAudioChunk(): Promise<{ dir: string; buffer: Buffer; path: string }> {
  const dir = await mkdtemp(join(tmpdir(), "glass-stt-chunk-"));
  const buffer = Buffer.alloc(1024, 1);
  const path = join(dir, "chunk.webm");
  await writeFile(path, buffer);
  return { dir, buffer, path };
}

test("mic transcription success via direct provider", async () => {
  const { path } = await writeAudioChunk();
  const config = resolveSttConfig({
    IIVO_GLASS_STT_ENDPOINT: "direct",
    IIVO_GLASS_OPENAI_API_KEY: "sk-test",
  });
  const result = await transcribeWithProvider(
    config,
    DEFAULT_CONFIG,
    { audioPath: path, mimeType: "audio/webm", source: "microphone" },
    { IIVO_GLASS_OPENAI_API_KEY: "sk-test" },
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ text: "what do you see on my screen" }),
      }) as Response,
  );
  assert.equal(result.text, "what do you see on my screen");
  assert.equal(result.endpoint, "direct");
});

test("system audio source selected passes through provider", async () => {
  const { path } = await writeAudioChunk();
  const config = resolveSttConfig({
    IIVO_GLASS_STT_ENDPOINT: "direct",
    IIVO_GLASS_OPENAI_API_KEY: "sk-test",
  });
  let bodySource = "";
  await transcribeWithProvider(
    config,
    DEFAULT_CONFIG,
    { audioPath: path, mimeType: "audio/webm", source: "system_audio" },
    { IIVO_GLASS_OPENAI_API_KEY: "sk-test" },
    async (_url, init) => {
      const form = init?.body as FormData;
      assert.ok(form);
      bodySource = "system_audio";
      return {
        ok: true,
        status: 200,
        json: async () => ({ text: "meeting notes" }),
      } as Response;
    },
  );
  assert.equal(bodySource, "system_audio");
});

test("STT server missing config returns clear error", async () => {
  const config = resolveSttConfig({
    IIVO_GLASS_STT_ENDPOINT: "direct",
    IIVO_GLASS_STT_ENABLED: "true",
  });
  assert.equal(config.status, "missing_key");
  const { path } = await writeAudioChunk();
  await assert.rejects(
    () =>
      transcribeWithProvider(config, DEFAULT_CONFIG, {
        audioPath: path,
        mimeType: "audio/webm",
        source: "microphone",
      }),
    /IIVO_GLASS_OPENAI_API_KEY|not configured/i,
  );
});

test("STT mid-utterance failure surfaces user message in chunk handler", async () => {
  const { dir, buffer } = await writeAudioChunk();
  const config = resolveSttConfig({
    IIVO_GLASS_STT_ENDPOINT: "direct",
    IIVO_GLASS_OPENAI_API_KEY: "sk-test",
  });
  let stt = buildGlassSttState(config);
  let lastError: string | undefined;

  const result = await processSttChunk(
    {
      buffer: new Uint8Array(buffer).buffer,
      mimeType: "audio/webm",
      source: "microphone",
    },
    {
      userDataPath: dir,
      glassConfig: DEFAULT_CONFIG,
      sessions: mockSessionStore(),
      sessionIsLive: () => false,
      eventContextFields: () => ({ metadata: { windowContext: { status: "unavailable" } } }),
      persistSessions: async () => {},
      appendTranscript: () => {},
      getSttState: () => stt,
      setSttState: (next) => {
        stt = next;
      },
      setLastNotice: () => {},
      setLastError: (msg) => {
        lastError = msg;
      },
      push: () => {},
    },
  );

  assert.equal(result.ok, false);
  assert.match(
    result.error ?? lastError ?? stt.lastError ?? "",
    new RegExp(STT_TRANSCRIPTION_FAILED_MESSAGE.slice(0, 20), "i"),
  );
  assert.equal(stt.transcribing, false);
});

test("disabled STT does not mark transcript ready", async () => {
  const { dir, buffer } = await writeAudioChunk();
  const config = resolveSttConfig({ IIVO_GLASS_STT_ENABLED: "false" });
  let stt = buildGlassSttState(config);

  const result = await processSttChunk(
    {
      buffer: new Uint8Array(buffer).buffer,
      mimeType: "audio/webm",
      source: "system_audio",
    },
    {
      userDataPath: dir,
      glassConfig: DEFAULT_CONFIG,
      sessions: mockSessionStore(),
      sessionIsLive: () => false,
      eventContextFields: () => ({ metadata: { windowContext: { status: "unavailable" } } }),
      persistSessions: async () => {},
      appendTranscript: () => {},
      getSttState: () => stt,
      setSttState: (next) => {
        stt = next;
      },
      setLastNotice: () => {},
      setLastError: () => {},
      push: () => {},
    },
  );

  assert.equal(result.ok, false);
  assert.equal(stt.transcribing, false);
  assert.equal(stt.enabled, false);
});
