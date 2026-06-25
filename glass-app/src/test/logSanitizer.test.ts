import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeLogText, sanitizeLogTextWithEnvSecrets } from "../shared/logSanitizer.ts";

const ANTHROPIC_KEY =
  "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function assertNoSecretLeak(output: string, secret: string): void {
  assert.doesNotMatch(output, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

test("sanitizeLogText redacts plain Anthropic keys", () => {
  const out = sanitizeLogText(`failed ${ANTHROPIC_KEY}`);
  assert.match(out, /sk-ant-\[REDACTED\]/);
  assertNoSecretLeak(out, ANTHROPIC_KEY);
});

test("sanitizeLogText redacts keys inside JSON strings", () => {
  const raw = `{"api_key": "${ANTHROPIC_KEY}"}`;
  const out = sanitizeLogText(raw);
  assert.match(out, /"api_key": "\[REDACTED\]"/);
  assertNoSecretLeak(out, ANTHROPIC_KEY);
});

test("sanitizeLogText redacts non-sk api_key JSON values", () => {
  const secret = "my-secret-custom-key-1234567890";
  const out = sanitizeLogText(`{"api_key": "${secret}"}`);
  assert.match(out, /"api_key": "\[REDACTED\]"/);
  assertNoSecretLeak(out, secret);
});

test("sanitizeLogText redacts Error messages", () => {
  const err = new Error(`auth failed: ${ANTHROPIC_KEY}`);
  const out = sanitizeLogTextWithEnvSecrets(err.message);
  assertNoSecretLeak(out, ANTHROPIC_KEY);
});

test("sanitizeLogText redacts multiline strings with embedded keys", () => {
  const raw = `line1\nThe key ${ANTHROPIC_KEY} was rejected\nline3`;
  const out = sanitizeLogText(raw);
  assertNoSecretLeak(out, ANTHROPIC_KEY);
});

test("sanitizeLogText redacts Authorization Bearer headers", () => {
  const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.super-secret-jwt";
  const out = sanitizeLogText(`Authorization: Bearer ${token}`);
  assert.match(out, /Authorization: Bearer \[REDACTED\]/);
  assertNoSecretLeak(out, token);
});

test("sanitizeLogText redacts bare Bearer tokens", () => {
  const out = sanitizeLogText(`curl -H "Bearer ${ANTHROPIC_KEY}"`);
  assert.match(out, /Bearer \[REDACTED\]/);
  assertNoSecretLeak(out, ANTHROPIC_KEY);
});

test("serialized objects are redacted before logging", () => {
  const json = JSON.stringify({ api_key: ANTHROPIC_KEY });
  const out = sanitizeLogTextWithEnvSecrets(json);
  assert.match(out, /"api_key": "\[REDACTED\]"/);
  assertNoSecretLeak(out, ANTHROPIC_KEY);
});

test("sanitizeLogTextWithEnvSecrets redacts env secrets", () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = ANTHROPIC_KEY;
  try {
    const out = sanitizeLogTextWithEnvSecrets(`error using ${process.env.ANTHROPIC_API_KEY}`);
    assertNoSecretLeak(out, ANTHROPIC_KEY);
    assert.match(out, /\[REDACTED\]/);
  } finally {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prev;
  }
});
