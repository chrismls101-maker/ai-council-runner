import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGhostSuggestion } from "../shared/glassIdeGhostSuggest.ts";

test("parseGhostSuggestion returns suffix after shared prefix", () => {
  assert.equal(
    parseGhostSuggestion('const foo = "bar";', 'const foo = '),
    '"bar";',
  );
});

test("parseGhostSuggestion strips markdown fences and first line only", () => {
  assert.equal(
    parseGhostSuggestion("```ts\nreturn 42;\nmore lines\n```", ""),
    "return 42;",
  );
});

test("parseGhostSuggestion caps length", () => {
  const long = "x".repeat(200);
  assert.equal(parseGhostSuggestion(long, "").length, 120);
});
