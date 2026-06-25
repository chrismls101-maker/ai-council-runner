import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExtractedIntent } from "../shared/audioBuildPlanParse.ts";

test("parseExtractedIntent parses bare JSON", () => {
  const raw = JSON.stringify({
    intent: "Build a todo app",
    requirements: ["React", "local storage"],
    stack: ["TypeScript", "Vite"],
  });
  const parsed = parseExtractedIntent(raw);
  assert.ok(parsed);
  assert.equal(parsed!.intent, "Build a todo app");
  assert.deepEqual(parsed!.requirements, ["React", "local storage"]);
  assert.deepEqual(parsed!.stack, ["TypeScript", "Vite"]);
});

test("parseExtractedIntent strips markdown code fences", () => {
  const raw = `\`\`\`json
{"intent":"API server","requirements":[],"stack":["Node"]}
\`\`\``;
  const parsed = parseExtractedIntent(raw);
  assert.ok(parsed);
  assert.equal(parsed!.intent, "API server");
  assert.deepEqual(parsed!.stack, ["Node"]);
});

test("parseExtractedIntent returns null for empty intent after parse", () => {
  const raw = JSON.stringify({ intent: "", requirements: [], stack: [] });
  const parsed = parseExtractedIntent(raw);
  assert.ok(parsed);
  assert.equal(parsed!.intent, "");
});

test("parseExtractedIntent returns null for malformed JSON", () => {
  assert.equal(parseExtractedIntent("not json"), null);
});

test("parseExtractedIntent filters non-string array entries", () => {
  const raw = JSON.stringify({
    intent: "Build X",
    requirements: ["ok", 42, null],
    stack: ["Rust", false],
  });
  const parsed = parseExtractedIntent(raw);
  assert.ok(parsed);
  assert.deepEqual(parsed!.requirements, ["ok"]);
  assert.deepEqual(parsed!.stack, ["Rust"]);
});
