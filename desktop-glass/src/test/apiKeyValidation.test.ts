import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeApiKeyId,
  normalizeApiKeyMeta,
  normalizeApiKeyValue,
} from "../shared/apiKeyValidation.ts";

test("normalizeApiKeyId accepts generated ids and rejects unsafe input", () => {
  assert.equal(normalizeApiKeyId("key_123_abc"), "key_123_abc");
  assert.equal(normalizeApiKeyId("  key_123_abc  "), "key_123_abc");
  assert.equal(normalizeApiKeyId("../etc/passwd"), null);
  assert.equal(normalizeApiKeyId("key_<script>"), null);
  assert.equal(normalizeApiKeyId(""), null);
  assert.equal(normalizeApiKeyId(null), null);
});

test("normalizeApiKeyMeta trims fields and defaults environment", () => {
  const meta = normalizeApiKeyMeta({
    id: "key_1_test",
    service: "  Anthropic  ",
    label: " personal ",
    environment: "bogus",
    createdAt: 100,
    lastUsedAt: null,
  });
  assert.deepEqual(meta, {
    id: "key_1_test",
    service: "Anthropic",
    label: "personal",
    environment: "any",
    createdAt: 100,
    lastUsedAt: null,
  });
});

test("normalizeApiKeyValue rejects empty and overlong values", () => {
  assert.equal(normalizeApiKeyValue(" sk-test "), "sk-test");
  assert.equal(normalizeApiKeyValue("   "), null);
  assert.equal(normalizeApiKeyValue("x".repeat(8193)), null);
});
