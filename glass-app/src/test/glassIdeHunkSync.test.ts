import { test } from "node:test";
import assert from "node:assert/strict";
import { revealLineAndPulseFromDisplay } from "../shared/glassIdeHunkSync.ts";
import type { DiffLine } from "../shared/diff.ts";

test("revealLineAndPulseFromDisplay returns first hunk line and pulse set", () => {
  const displayLines: DiffLine[] = [
    { op: "equal", text: "keep", beforeLineNo: 1, afterLineNo: 1 },
    { op: "remove", text: "old", beforeLineNo: 2 },
    { op: "add", text: "new", afterLineNo: 2 },
    { op: "add", text: "more", afterLineNo: 3 },
  ];

  const result = revealLineAndPulseFromDisplay(displayLines);
  assert.equal(result.revealLine, 2);
  assert.deepEqual(result.pulseLines, [2, 3]);
});

test("revealLineAndPulseFromDisplay defaults when no lines", () => {
  const result = revealLineAndPulseFromDisplay(undefined);
  assert.equal(result.revealLine, 1);
  assert.deepEqual(result.pulseLines, []);
});
