import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extensionFromRelativePath,
  languageFromExtension,
  languageFromRelativePath,
} from "../shared/glassIdeProject.ts";
import { tokenizeLine } from "../shared/glassIdeSyntax.ts";

test("languageFromExtension maps TypeScript", () => {
  assert.equal(languageFromExtension(".tsx"), "typescript");
});

test("languageFromRelativePath uses file name extension", () => {
  assert.equal(languageFromRelativePath("src/app/main.py"), "python");
});

test("extensionFromRelativePath handles nested paths", () => {
  assert.equal(extensionFromRelativePath("src/utils/foo.ts"), ".ts");
});

test("tokenizeLine highlights javascript keywords", () => {
  const tokens = tokenizeLine("const x = 1;", "javascript");
  assert.equal(tokens[0]?.kind, "keyword");
  assert.equal(tokens[0]?.text, "const");
});

test("tokenizeLine treats line comments", () => {
  const tokens = tokenizeLine("// hello", "typescript");
  assert.deepEqual(tokens, [{ kind: "comment", text: "// hello" }]);
});

test("tokenizeLine treats python comments", () => {
  const tokens = tokenizeLine("# note", "python");
  assert.deepEqual(tokens, [{ kind: "comment", text: "# note" }]);
});
