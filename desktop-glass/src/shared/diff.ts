/**
 * Pure line-diff utility — no Electron imports.
 *
 * Implements an LCS-based unified line diff for the Glass "Apply to file"
 * diff preview (#161). No external dependencies.
 *
 * Trailing-newline policy: both sides are normalised (CRLF → LF, single
 * trailing empty element stripped) before diffing, so on-disk files ending
 * with `\n` don't produce spurious last-line diffs against code blocks that
 * don't. The actual write is unaffected — only the display is normalised.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type DiffOp = "equal" | "add" | "remove";

export interface DiffLine {
  op: DiffOp;
  /** Line content — no newline character. */
  text: string;
  /** 1-based line number in the original (before) content. Present for "equal" and "remove". */
  beforeLineNo?: number;
  /** 1-based line number in the proposed (after) content. Present for "equal" and "add". */
  afterLineNo?: number;
  /**
   * When set, this line is a collapse sentinel produced by collapseUnchanged().
   * The value is the number of hidden "equal" lines it replaces.
   */
  collapsed?: number;
}

export interface UnifiedDiff {
  lines: DiffLine[];
  /** Count of "add" lines. */
  added: number;
  /** Count of "remove" lines. */
  removed: number;
  /** true when before and after are identical. */
  unchanged: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * If either side exceeds this many lines the LCS table would be too large;
 * fall back to a simple all-remove / all-add representation.
 */
export const MAX_LCS_LINES = 2_000;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Split text into lines, normalising CRLF → LF and stripping the single
 * trailing empty element that `split('\n')` produces for a trailing newline.
 */
export function toLines(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

/** Build the LCS dynamic-programming table for two string arrays. */
function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : dp[i - 1][j] > dp[i][j - 1]
            ? dp[i - 1][j]
            : dp[i][j - 1];
    }
  }
  return dp;
}

/** Backtrack the LCS table to produce an ordered diff operation list. */
function buildOps(
  dp: number[][],
  a: string[],
  b: string[],
): Array<{ op: DiffOp; text: string }> {
  const ops: Array<{ op: DiffOp; text: string }> = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ op: "equal", text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ op: "add", text: b[j - 1] });
      j--;
    } else {
      ops.push({ op: "remove", text: a[i - 1] });
      i--;
    }
  }
  ops.reverse();
  return ops;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute a unified line diff between `before` (current file content) and
 * `after` (proposed replacement code).
 *
 * Both strings are normalised before diffing — see module-level note on the
 * trailing-newline policy.
 *
 * For files larger than MAX_LCS_LINES on either side, falls back to a simple
 * all-remove + all-add representation to avoid excessive memory allocation.
 */
export function computeUnifiedDiff(before: string, after: string): UnifiedDiff {
  const aLines = toLines(before);
  const bLines = toLines(after);

  let rawOps: Array<{ op: DiffOp; text: string }>;

  if (aLines.length > MAX_LCS_LINES || bLines.length > MAX_LCS_LINES) {
    // Large-file fallback: no LCS, just show all removals then all additions
    rawOps = [
      ...aLines.map((text) => ({ op: "remove" as DiffOp, text })),
      ...bLines.map((text) => ({ op: "add" as DiffOp, text })),
    ];
  } else {
    const dp = lcsTable(aLines, bLines);
    rawOps = buildOps(dp, aLines, bLines);
  }

  // Assign 1-based line numbers
  let beforeNo = 1;
  let afterNo = 1;
  let added = 0;
  let removed = 0;

  const lines: DiffLine[] = rawOps.map((raw) => {
    const line: DiffLine = { op: raw.op, text: raw.text };
    if (raw.op === "equal") {
      line.beforeLineNo = beforeNo++;
      line.afterLineNo = afterNo++;
    } else if (raw.op === "remove") {
      line.beforeLineNo = beforeNo++;
      removed++;
    } else {
      line.afterLineNo = afterNo++;
      added++;
    }
    return line;
  });

  return { lines, added, removed, unchanged: added === 0 && removed === 0 };
}

/**
 * Collapse long unchanged ("equal") runs in a diff, keeping `context` lines of
 * context on each side of every changed region.
 *
 * Collapsed runs are replaced by a single sentinel `DiffLine` with:
 *   - `op: "equal"`
 *   - `text: ""`
 *   - `collapsed`: number of hidden lines
 *
 * Returns a new array of `DiffLine` — does not mutate the input.
 */
export function collapseUnchanged(diff: UnifiedDiff, context = 3): DiffLine[] {
  const { lines } = diff;
  if (lines.length === 0) return [];

  // Build a mask of lines to keep
  const keep = new Array<boolean>(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].op !== "equal") {
      const lo = Math.max(0, i - context);
      const hi = Math.min(lines.length - 1, i + context);
      for (let k = lo; k <= hi; k++) keep[k] = true;
    }
  }

  // Nothing to collapse (all lines changed or context covers everything)
  if (keep.every((v) => v)) return [...lines];

  const result: DiffLine[] = [];
  let i = 0;
  while (i < lines.length) {
    if (keep[i]) {
      result.push(lines[i]);
      i++;
    } else {
      let j = i;
      while (j < lines.length && !keep[j]) j++;
      result.push({ op: "equal", text: "", collapsed: j - i });
      i = j;
    }
  }
  return result;
}
