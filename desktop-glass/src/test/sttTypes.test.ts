import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGlassSttState,
  buildTranscriptEventMetadata,
  resolveSttConfig,
  sttProviderLabel,
  STT_MISSING_KEY_MESSAGE,
} from "../shared/sttTypes.ts";

test("OpenAI STT disabled by default", () => {
  const config = resolveSttConfig({});
  assert.equal(config.provider, "none");
  assert.equal(config.status, "disabled");
  assert.equal(config.enabled, false);
});

test("OpenAI STT missing key when enabled without OPENAI_API_KEY", () => {
  const config = resolveSttConfig({
    IIVO_GLASS_STT_ENABLED: "true",
    IIVO_GLASS_STT_PROVIDER: "openai",
  });
  assert.equal(config.provider, "openai");
  assert.equal(config.status, "missing_key");
  assert.match(STT_MISSING_KEY_MESSAGE, /OPENAI_API_KEY/i);
});

test("OpenAI STT configured with key", () => {
  const config = resolveSttConfig({
    IIVO_GLASS_STT_ENABLED: "true",
    IIVO_GLASS_STT_PROVIDER: "openai",
    OPENAI_API_KEY: "sk-test",
  });
  assert.equal(config.status, "configured");
  assert.equal(buildGlassSttState(config).enabled, true);
});

test("no mock provider in product config", () => {
  const config = resolveSttConfig({
    IIVO_GLASS_STT_ENABLED: "true",
    IIVO_GLASS_STT_PROVIDER: "mock",
  });
  assert.equal(config.provider, "none");
  assert.notEqual(sttProviderLabel("openai", "configured"), "Mock");
});

test("transcript event metadata on success", () => {
  const meta = buildTranscriptEventMetadata({
    audioPath: "/tmp/session-audio/s1/e1.webm",
    audioMimeType: "audio/webm",
    model: "gpt-4o-mini-transcribe",
    source: "system_audio",
    durationMs: 1200,
    status: "success",
  });
  assert.equal(meta.transcriptionProvider, "openai");
  assert.equal(meta.transcriptionStatus, "success");
  assert.equal(meta.transcriptionSource, "system_audio");
});
