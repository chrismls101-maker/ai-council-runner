/**
 * Unit tests for src/shared/diff.ts — pure LCS line diff.
 * No Electron required; runs in the Node test runner.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeUnifiedDiff,
  collapseUnchanged,
  toLines,
  MAX_LCS_LINES,
  type DiffLine,
} from "../shared/diff.ts";

// ── toLines ───────────────────────────────────────────────────────────────────

describe("toLines", () => {
  it("splits on LF", () => {
    assert.deepEqual(toLines("a\nb\nc"), ["a", "b", "c"]);
  });

  it("strips a single trailing empty element from terminal newline", () => {
    assert.deepEqual(toLines("a\nb\n"), ["a", "b"]);
  });

  it("normalises CRLF to LF", () => {
    assert.deepEqual(toLines("a\r\nb\r\n"), ["a", "b"]);
  });

  it("handles a single empty line", () => {
    assert.deepEqual(toLines(""), []);
  });

  it("preserves blank lines inside", () => {
    assert.deepEqual(toLines("a\n\nb"), ["a", "", "b"]);
  });
});

// ── computeUnifiedDiff ────────────────────────────────────────────────────────

describe("computeUnifiedDiff", () => {
  it("identical content → unchanged:true, no adds/removes", () => {
    const text = "line 1\nline 2\nline 3\n";
    const diff = computeUnifiedDiff(text, text);
    assert.equal(diff.unchanged, true);
    assert.equal(diff.added, 0);
    assert.equal(diff.removed, 0);
    assert(diff.lines.every((l) => l.op === "equal"));
  });

  it("trailing-newline difference does NOT produce a diff", () => {
    // On-disk file ends with \n; extracted code block does not — should be equal
    const diff = computeUnifiedDiff("a\nb\n", "a\nb");
    assert.equal(diff.unchanged, true);
  });

  it("CRLF on either side normalised before diffing", () => {
    const diff = computeUnifiedDiff("a\r\nb\r\n", "a\nb\n");
    assert.equal(diff.unchanged, true);
  });

  it("pure addition (empty before) → all adds, removed:0", () => {
    const diff = computeUnifiedDiff("", "line 1\nline 2\n");
    assert.equal(diff.removed, 0);
    assert.equal(diff.added, 2);
    assert(diff.lines.every((l) => l.op === "add"));
  });

  it("pure deletion (empty after) → all removes, added:0", () => {
    const diff = computeUnifiedDiff("a\nb\nc\n", "");
    assert.equal(diff.added, 0);
    assert.equal(diff.removed, 3);
    assert(diff.lines.every((l) => l.op === "remove"));
  });

  it("single line changed → one remove + one add", () => {
    const diff = computeUnifiedDiff("hello\n", "world\n");
    const ops = diff.lines.map((l) => l.op);
    assert(ops.includes("remove"), "should have a remove");
    assert(ops.includes("add"), "should have an add");
    assert.equal(diff.removed, 1);
    assert.equal(diff.added, 1);
  });

  it("insertion in the middle preserves surrounding equal lines", () => {
    const before = "a\nb\nc\n";
    const after = "a\nINSERTED\nb\nc\n";
    const diff = computeUnifiedDiff(before, after);
    assert.equal(diff.added, 1);
    assert.equal(diff.removed, 0);
    const addedLine = diff.lines.find((l) => l.op === "add");
    assert(addedLine, "should have an added line");
    assert.equal(addedLine!.text, "INSERTED");
    const equalLines = diff.lines.filter((l) => l.op === "equal");
    assert.equal(equalLines.length, 3); // a, b, c unchanged
  });

  it("deletion in the middle preserves surrounding equal lines", () => {
    const before = "a\nDELETE_ME\nb\n";
    const after = "a\nb\n";
    const diff = computeUnifiedDiff(before, after);
    assert.equal(diff.removed, 1);
    assert.equal(diff.added, 0);
    const removedLine = diff.lines.find((l) => l.op === "remove");
    assert.equal(removedLine!.text, "DELETE_ME");
  });

  it("beforeLineNo is 1-based and monotonically increasing for removes + equals", () => {
    const diff = computeUnifiedDiff("a\nb\nc\n", "a\nX\nc\n");
    const beforeNos = diff.lines
      .filter((l) => l.beforeLineNo !== undefined)
      .map((l) => l.beforeLineNo as number);
    for (let i = 1; i < beforeNos.length; i++) {
      assert(beforeNos[i] > beforeNos[i - 1], `line numbers not monotonic at index ${i}`);
    }
    assert.equal(beforeNos[0], 1, "first before line no should be 1");
  });

  it("afterLineNo is 1-based and monotonically increasing for adds + equals", () => {
    const diff = computeUnifiedDiff("a\nb\nc\n", "a\nX\nc\n");
    const afterNos = diff.lines
      .filter((l) => l.afterLineNo !== undefined)
      .map((l) => l.afterLineNo as number);
    for (let i = 1; i < afterNos.length; i++) {
      assert(afterNos[i] > afterNos[i - 1], `after line numbers not monotonic at index ${i}`);
    }
  });

  it("blank-line-only change is detected as a diff", () => {
    // Removing a blank line in the middle
    const diff = computeUnifiedDiff("a\n\nb\n", "a\nb\n");
    assert(!diff.unchanged, "should detect blank line removal as a change");
    assert.equal(diff.removed, 1);
  });

  it("whitespace-only change is detected", () => {
    const diff = computeUnifiedDiff("  spaces\n", "\ttabs\n");
    assert.equal(diff.removed, 1);
    assert.equal(diff.added, 1);
  });

  it("both empty strings → unchanged:true", () => {
    const diff = computeUnifiedDiff("", "");
    assert.equal(diff.unchanged, true);
    assert.equal(diff.lines.length, 0);
  });

  it("large-file fallback: returns add+remove without error (> MAX_LCS_LINES)", () => {
    // Build strings each with MAX_LCS_LINES + 1 lines
    const bigBefore = Array.from({ length: MAX_LCS_LINES + 1 }, (_, i) => `line ${i}`).join("\n");
    const bigAfter = Array.from({ length: MAX_LCS_LINES + 1 }, (_, i) => `changed ${i}`).join("\n");
    const diff = computeUnifiedDiff(bigBefore, bigAfter);
    assert.equal(diff.added, MAX_LCS_LINES + 1);
    assert.equal(diff.removed, MAX_LCS_LINES + 1);
  });

  it("realistic: TypeScript function replacement", () => {
    const before = [
      "export function greet(name: string): string {",
      "  return 'Hello, ' + name;",
      "}",
    ].join("\n");
    const after = [
      "export function greet(name: string): string {",
      "  return `Hello, ${name}!`;",
      "}",
    ].join("\n");
    const diff = computeUnifiedDiff(before, after);
    assert.equal(diff.added, 1);
    assert.equal(diff.removed, 1);
    // Surrounding lines stay equal
    assert.equal(diff.lines.filter((l) => l.op === "equal").length, 2);
  });
});

// ── collapseUnchanged ─────────────────────────────────────────────────────────

describe("collapseUnchanged", () => {
  it("returns empty array for empty diff", () => {
    const diff = computeUnifiedDiff("", "");
    assert.deepEqual(collapseUnchanged(diff), []);
  });

  it("diff with only changes — nothing to collapse", () => {
    const diff = computeUnifiedDiff("a\n", "b\n");
    const collapsed = collapseUnchanged(diff, 3);
    // No equal lines at all, so no collapse sentinels
    assert(!collapsed.some((l) => l.collapsed !== undefined));
  });

  it("collapses a long unchanged run in the middle", () => {
    // 20 unchanged lines with a single change in the middle
    const lines = Array.from({ length: 20 }, (_, i) => `line${i}`);
    const before = lines.join("\n");
    lines[10] = "CHANGED";
    const after = lines.join("\n");

    const diff = computeUnifiedDiff(before, after);
    const collapsed = collapseUnchanged(diff, 3);

    // Change in middle of 20 lines → two sentinels: one before the hunk, one after
    const sentinels = collapsed.filter((l) => l.collapsed !== undefined);
    assert(sentinels.length >= 1, "should have at least one collapse sentinel");
    const sentinel = sentinels[0];
    assert(sentinel.collapsed! > 0, "collapsed count should be positive");

    // Context lines immediately around the change should remain
    const equalKept = collapsed.filter((l) => l.op === "equal" && !l.collapsed);
    assert(equalKept.length >= 3, "should keep at least context lines on each side");
  });

  it("collapses lines at the start and end (no changes at edges)", () => {
    // 10 lines, change at line 5 only
    const lineArr = Array.from({ length: 10 }, (_, i) => `line${i}`);
    const before = lineArr.join("\n");
    lineArr[4] = "CHANGE";
    const after = lineArr.join("\n");

    const diff = computeUnifiedDiff(before, after);
    const collapsed = collapseUnchanged(diff, 2); // context=2

    const sentinels = collapsed.filter((l) => l.collapsed !== undefined);
    assert(sentinels.length >= 1, "should have at least one sentinel (leading unchanged)");
  });

  it("context:0 collapses ALL unchanged lines", () => {
    const before = "keep\nequal1\nequal2\nequal3\nend\n";
    const after = "CHANGED\nequal1\nequal2\nequal3\nend\n";
    const diff = computeUnifiedDiff(before, after);
    const collapsed = collapseUnchanged(diff, 0);

    // All equal lines after the change should be collapsed
    const equalUnsentinel = collapsed.filter((l) => l.op === "equal" && !l.collapsed);
    assert.equal(equalUnsentinel.length, 0, "with context=0, no bare equal lines should remain");
  });

  it("does not insert sentinel between two adjacent hunks within context distance", () => {
    // Change at line 1 and change at line 3, context=2 → they're within range, no gap
    const before = "A\nB\nC\nD\nE\n";
    const after = "X\nB\nX\nD\nE\n";
    const diff = computeUnifiedDiff(before, after);
    const collapsed = collapseUnchanged(diff, 2);
    // Lines B and D are equal and within context of both changes — no collapse
    const sentinels = collapsed.filter((l) => l.collapsed !== undefined);
    assert.equal(sentinels.length, 0, "no sentinels when changes are within 2*context+1 of each other");
  });

  it("fully unchanged diff collapses to a single sentinel", () => {
    const text = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n");
    const diff = computeUnifiedDiff(text, text);
    const collapsed = collapseUnchanged(diff, 3);
    const sentinels = collapsed.filter((l) => l.collapsed !== undefined);
    assert.equal(sentinels.length, 1, "fully unchanged should collapse to one sentinel");
    assert.equal(sentinels[0].collapsed, 20, "collapsed count should be total line count");
  });

  it("hidden line count in sentinel equals the number of skipped equal lines", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `L${i}`);
    const before = lines.join("\n");
    lines[0] = "CHANGE"; // change only first line
    const after = lines.join("\n");

    const diff = computeUnifiedDiff(before, after);
    const collapsed = collapseUnchanged(diff, 1); // 1 context line

    const sentinel = collapsed.find((l) => l.collapsed !== undefined);
    assert(sentinel, "should have a sentinel");
    // Line 0 changed, line 1 is context, lines 2–9 collapse → 8 hidden
    assert.equal(sentinel!.collapsed, 8);
  });
});
