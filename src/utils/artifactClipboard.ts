import type {
  ArtifactSection,
  ArtifactTable,
  IivoArtifact,
} from "../types/artifacts";

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function sectionPlainText(section: ArtifactSection): string {
  if (typeof section.content === "string") {
    return section.content.trim();
  }
  if (section.kind === "table" && "columns" in section.content) {
    return tableToCsv(section.content);
  }
  if (section.kind === "checklist" && "items" in section.content) {
    return section.content.items
      .map((item) => `${item.checked ? "[x]" : "[ ]"} ${item.label}${item.note ? ` — ${item.note}` : ""}`)
      .join("\n");
  }
  return "";
}

export function tableToCsv(table: ArtifactTable): string {
  const header = table.columns.join(",");
  const rows = table.rows.map((row) =>
    table.columns.map((col) => String(row[col] ?? "").replace(/"/g, '""')).join(","),
  );
  const lines = [header, ...rows];
  if (table.totals) {
    lines.push(
      table.columns.map((col) => String(table.totals?.[col] ?? "")).join(","),
    );
  }
  return lines.join("\n");
}

export function artifactFullText(artifact: IivoArtifact): string {
  const parts = artifact.sections.map((section) => {
    const body = sectionPlainText(section);
    return body ? `${section.label}\n${body}` : "";
  });
  return parts.filter(Boolean).join("\n\n");
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/plain;charset=utf-8",
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
