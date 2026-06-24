import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeLogText, sanitizeLogTextWithEnvSecrets } from "../shared/logSanitizer.ts";
import { DEFAULT_GLASS_USER_SETTINGS } from "../shared/glassSettings.ts";
import { maskApiKeyDisplay } from "../shared/maskApiKey.ts";
import { isAnthropicKeyFormatValid } from "../shared/anthropicKeyFormat.ts";
import { isOpenAiKeyFormatValid } from "../shared/openaiKeyFormat.ts";

test("sanitizeLogText redacts Anthropic keys and bearer tokens", () => {
  const raw =
    "failed sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 and Authorization: Bearer sk-secret-token-abcdefghij";
  const out = sanitizeLogText(raw);
  assert.match(out, /sk-ant-\[REDACTED\]/);
  assert.doesNotMatch(out, /sk-ant-api03-abcdefghijklmnopqrstuvwxyz/);
  assert.match(out, /Authorization: Bearer \[REDACTED\]/);
});

test("sanitizeLogTextWithEnvSecrets redacts env secrets", () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "sk-ant-api03-super-secret-test-key-value-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  try {
    const out = sanitizeLogTextWithEnvSecrets(`error using ${process.env.ANTHROPIC_API_KEY}`);
    assert.doesNotMatch(out, /super-secret-test-key/);
    assert.match(out, /\[REDACTED\]/);
  } finally {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prev;
  }
});

test("isFirstRun reflects onboardingComplete", () => {
  const isFirstRun = (settings: typeof DEFAULT_GLASS_USER_SETTINGS) => !settings.onboardingComplete;
  assert.equal(isFirstRun(DEFAULT_GLASS_USER_SETTINGS), true);
  assert.equal(isFirstRun({ ...DEFAULT_GLASS_USER_SETTINGS, onboardingComplete: true }), false);
});

test("maskApiKeyDisplay never returns full key", () => {
  const masked = maskApiKeyDisplay("sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
  assert.match(masked, /^sk-ant/);
  assert.match(masked, /••••/);
  assert.doesNotMatch(masked, /ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$/);
});

test("anthropic and openai key format validators", () => {
  const longAnthropic =
    "sk-ant-api03-" + "a".repeat(95);
  assert.equal(isAnthropicKeyFormatValid(longAnthropic), true);
  assert.equal(isAnthropicKeyFormatValid("sk-ant-short"), false);
  assert.equal(isOpenAiKeyFormatValid("sk-" + "x".repeat(48)), true);
  assert.equal(isOpenAiKeyFormatValid("bad"), false);
});
