import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firstChangedLineFromDisplay,
  normalizeIdeRelativePath,
  pathsMatchRelative,
} from "../shared/glassIdeInlineDiff.ts";
import type { DiffLine } from "../shared/diff.ts";

test("firstChangedLineFromDisplay prefers first remove hunk", () => {
  const lines: DiffLine[] = [
    { op: "equal", text: "keep", beforeLineNo: 1, afterLineNo: 1 },
    { op: "remove", text: "old", beforeLineNo: 2 },
    { op: "add", text: "new", afterLineNo: 2 },
  ];
  assert.equal(firstChangedLineFromDisplay(lines), 2);
});

test("firstChangedLineFromDisplay skips collapsed sentinels", () => {
  const lines: DiffLine[] = [
    { op: "equal", text: "", collapsed: 12 },
    { op: "add", text: "new", afterLineNo: 14 },
  ];
  assert.equal(firstChangedLineFromDisplay(lines), 14);
});

test("pathsMatchRelative normalizes slashes", () => {
  assert.equal(pathsMatchRelative("src/a.ts", "src/a.ts"), true);
  assert.equal(normalizeIdeRelativePath("src\\b.ts"), "src/b.ts");
});
