import type { ArtifactChecklist, ArtifactSection, ArtifactTable } from "../types/artifacts";
import { contentToCompareText, diffLines, type DiffLine } from "./textDiff.ts";

export type TableCellChange = {
  rowKey: string;
  column: string;
  before: string;
  after: string;
};

export type TableDiffResult = {
  mode: "table";
  addedRows: Array<Record<string, string>>;
  removedRows: Array<Record<string, string>>;
  changedCells: TableCellChange[];
  totalsChanged: Array<{ key: string; before: string; after: string }>;
};

export type ChecklistItemChange = {
  label: string;
  type: "added" | "removed" | "changed";
  before?: { checked?: boolean; note?: string };
  after?: { checked?: boolean; note?: string };
};

export type ChecklistDiffResult = {
  mode: "checklist";
  changes: ChecklistItemChange[];
};

export type TextDiffResult = {
  mode: "text";
  lines: DiffLine[];
};

export type ArtifactDiffResult = TableDiffResult | ChecklistDiffResult | TextDiffResult;

function isTableContent(content: unknown): content is ArtifactTable {
  return (
    !!content &&
    typeof content === "object" &&
    Array.isArray((content as ArtifactTable).columns) &&
    Array.isArray((content as ArtifactTable).rows)
  );
}

function isChecklistContent(content: unknown): content is ArtifactChecklist {
  return !!content && typeof content === "object" && Array.isArray((content as ArtifactChecklist).items);
}

function rowKey(row: Record<string, string | number>, columns: string[], index?: number): string {
  const primary = columns[0];
  if (primary && row[primary] != null && String(row[primary]).length > 0) {
    return String(row[primary]);
  }
  return `__row_${index ?? 0}`;
}

function normalizeRow(row: Record<string, string | number>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) out[k] = String(v);
  return out;
}

export function diffTable(before: ArtifactTable, after: ArtifactTable): TableDiffResult {
  const columns = [...new Set([...before.columns, ...after.columns])];
  const beforeMap = new Map(
    before.rows.map((r, i) => [rowKey(r, before.columns, i), normalizeRow(r)]),
  );
  const afterMap = new Map(
    after.rows.map((r, i) => [rowKey(r, after.columns, i), normalizeRow(r)]),
  );

  const addedRows: Array<Record<string, string>> = [];
  const removedRows: Array<Record<string, string>> = [];
  const changedCells: TableCellChange[] = [];

  for (const [key, row] of afterMap) {
    if (!beforeMap.has(key)) addedRows.push(row);
  }
  for (const [key, row] of beforeMap) {
    if (!afterMap.has(key)) removedRows.push(row);
  }

  for (const [key, afterRow] of afterMap) {
    const beforeRow = beforeMap.get(key);
    if (!beforeRow) continue;
    for (const col of columns) {
      const b = beforeRow[col] ?? "";
      const a = afterRow[col] ?? "";
      if (b !== a) {
        changedCells.push({ rowKey: key, column: col, before: b, after: a });
      }
    }
  }

  const totalsChanged: Array<{ key: string; before: string; after: string }> = [];
  const allTotalKeys = new Set([
    ...Object.keys(before.totals ?? {}),
    ...Object.keys(after.totals ?? {}),
  ]);
  for (const key of allTotalKeys) {
    const b = String(before.totals?.[key] ?? "");
    const a = String(after.totals?.[key] ?? "");
    if (b !== a) totalsChanged.push({ key, before: b, after: a });
  }

  return { mode: "table", addedRows, removedRows, changedCells, totalsChanged };
}

export function diffChecklist(
  before: ArtifactChecklist,
  after: ArtifactChecklist,
): ChecklistDiffResult {
  const beforeMap = new Map(before.items.map((i) => [i.label, i]));
  const afterMap = new Map(after.items.map((i) => [i.label, i]));
  const changes: ChecklistItemChange[] = [];

  for (const [label, item] of afterMap) {
    if (!beforeMap.has(label)) {
      changes.push({ label, type: "added", after: { checked: item.checked, note: item.note } });
    }
  }
  for (const [label, item] of beforeMap) {
    if (!afterMap.has(label)) {
      changes.push({ label, type: "removed", before: { checked: item.checked, note: item.note } });
    }
  }
  for (const [label, afterItem] of afterMap) {
    const beforeItem = beforeMap.get(label);
    if (!beforeItem) continue;
    if (
      beforeItem.checked !== afterItem.checked ||
      (beforeItem.note ?? "") !== (afterItem.note ?? "")
    ) {
      changes.push({
        label,
        type: "changed",
        before: { checked: beforeItem.checked, note: beforeItem.note },
        after: { checked: afterItem.checked, note: afterItem.note },
      });
    }
  }

  return { mode: "checklist", changes };
}

export function diffArtifactSectionContent(
  before: unknown,
  after: unknown,
  kind?: ArtifactSection["kind"],
): ArtifactDiffResult {
  if ((kind === "table" || isTableContent(before)) && isTableContent(before) && isTableContent(after)) {
    return diffTable(before, after);
  }
  if (
    (kind === "checklist" || isChecklistContent(before)) &&
    isChecklistContent(before) &&
    isChecklistContent(after)
  ) {
    return diffChecklist(before, after);
  }
  return {
    mode: "text",
    lines: diffLines(contentToCompareText(before), contentToCompareText(after)),
  };
}
