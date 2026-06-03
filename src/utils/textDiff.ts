export type DiffLine = {
  type: "same" | "add" | "remove";
  text: string;
};

/** Lightweight line-level diff (no external deps). */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] =
        a[i] === b[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      result.push({ type: "same", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      result.push({ type: "remove", text: a[i]! });
      i++;
    } else {
      result.push({ type: "add", text: b[j]! });
      j++;
    }
  }
  while (i < m) {
    result.push({ type: "remove", text: a[i]! });
    i++;
  }
  while (j < n) {
    result.push({ type: "add", text: b[j]! });
    j++;
  }
  return result;
}

export function contentToCompareText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    return JSON.stringify(content, null, 2);
  }
  return String(content ?? "");
}
