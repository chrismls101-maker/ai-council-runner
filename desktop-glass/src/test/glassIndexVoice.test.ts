import { test } from "node:test";
import assert from "node:assert/strict";
import { isCoderIntent } from "../shared/voiceCoderIntent.ts";
import { cosineSim, isMostlyTextContent } from "../main/glassIndex.ts";

test("isCoderIntent matches fix/refactor/coder patterns", () => {
  assert.equal(isCoderIntent("fix the error in this file"), true);
  assert.equal(isCoderIntent("refactor this function"), true);
  assert.equal(isCoderIntent("glass coder: add logging"), true);
  assert.equal(isCoderIntent("what is the weather today"), false);
});

test("cosineSim returns 1 for identical vectors", () => {
  const v = [1, 0, 0];
  assert.equal(cosineSim(v, v), 1);
});

test("cosineSim returns 0 for orthogonal vectors", () => {
  assert.equal(cosineSim([1, 0], [0, 1]), 0);
});

test("isMostlyTextContent rejects binary-heavy buffers", () => {
  assert.equal(isMostlyTextContent("export const ok = 1;\n"), true);
  const binary = "\u0000".repeat(100) + "text";
  assert.equal(isMostlyTextContent(binary), false);
});
