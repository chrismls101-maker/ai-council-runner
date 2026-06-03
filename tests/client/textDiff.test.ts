import assert from "node:assert/strict";
import { diffLines } from "../../src/utils/textDiff.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

test("textDiff: detects added and removed lines", () => {
  const before = "Line one\nLine two";
  const after = "Line one\nLine three";
  const diff = diffLines(before, after);
  assert.ok(diff.some((d) => d.type === "remove" && d.text === "Line two"));
  assert.ok(diff.some((d) => d.type === "add" && d.text === "Line three"));
  assert.ok(diff.some((d) => d.type === "same" && d.text === "Line one"));
});
