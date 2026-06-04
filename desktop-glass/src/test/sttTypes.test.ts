import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGlassSttState,
  buildTranscriptEventMetadata,
  resolveSttConfig,
  sttProviderLabel,
  STT_MISSING_KEY_MESSAGE,
} from "../shared/sttTypes.ts";

test("server STT preferred by default", () => {
  const config = resolveSttConfig({});
  assert.equal(config.endpoint, "server");
  assert.equal(config.status, "configured");
  assert.equal(config.enabled, true);
  assert.equal(sttProviderLabel("openai", "configured", "server"), "OpenAI (IIVO server)");
});

test("explicit disable", () => {
  const config = resolveSttConfig({ IIVO_GLASS_STT_ENABLED: "false" });
  assert.equal(config.status, "disabled");
  assert.equal(config.enabled, false);
});

test("direct STT missing key when no OPENAI_API_KEY", () => {
  const config = resolveSttConfig({
    IIVO_GLASS_STT_ENDPOINT: "direct",
    IIVO_GLASS_STT_ENABLED: "true",
  });
  assert.equal(config.endpoint, "direct");
  assert.equal(config.status, "missing_key");
  assert.match(STT_MISSING_KEY_MESSAGE, /OPENAI_API_KEY/i);
});

test("direct STT configured with key", () => {
  const config = resolveSttConfig({
    IIVO_GLASS_STT_ENDPOINT: "direct",
    OPENAI_API_KEY: "sk-test",
  });
  assert.equal(config.status, "configured");
  assert.equal(buildGlassSttState(config).enabled, true);
});

test("no mock provider in product config", () => {
  const config = resolveSttConfig({
    IIVO_GLASS_STT_PROVIDER: "mock",
    IIVO_GLASS_STT_ENDPOINT: "none",
  });
  assert.equal(config.provider, "none");
  assert.notEqual(sttProviderLabel("openai", "configured", "server"), "Mock");
});

test("transcript event metadata includes endpoint", () => {
  const meta = buildTranscriptEventMetadata({
    audioPath: "/tmp/session-audio/s1/e1.webm",
    audioMimeType: "audio/webm",
    model: "gpt-4o-mini-transcribe",
    source: "system_audio",
    durationMs: 1200,
    status: "success",
    endpoint: "server",
  });
  assert.equal(meta.transcriptionProvider, "openai");
  assert.equal(meta.transcriptionEndpoint, "server");
});
