import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultIivoServerDegradedDetail,
  isIivoServerUnreachableError,
  isIivoServerUnreachableMessage,
} from "../shared/iivoServerDegraded.ts";

test("isIivoServerUnreachableMessage matches common network failures", () => {
  assert.equal(isIivoServerUnreachableMessage("fetch failed"), true);
  assert.equal(isIivoServerUnreachableMessage("ECONNREFUSED"), true);
  assert.equal(isIivoServerUnreachableMessage("Translation server unavailable."), true);
  assert.equal(isIivoServerUnreachableMessage("Invalid API key"), false);
});

test("isIivoServerUnreachableError reads Error messages", () => {
  assert.equal(isIivoServerUnreachableError(new Error("503 Service Unavailable")), true);
  assert.equal(isIivoServerUnreachableError(new Error("bad request")), false);
});

test("defaultIivoServerDegradedDetail names the affected feature", () => {
  assert.match(defaultIivoServerDegradedDetail("translate"), /Live Translate/i);
  assert.match(defaultIivoServerDegradedDetail("stt"), /speech-to-text/i);
  assert.match(defaultIivoServerDegradedDetail("memory"), /Memory Vault/i);
});
