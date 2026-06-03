import type { ArtifactSection, ArtifactTable } from "./artifactTypes.js";

export function sectionPlainText(section: ArtifactSection): string {
  if (typeof section.content === "string") {
    return section.content.trim();
  }
  if (section.kind === "table" && section.content && "columns" in section.content) {
    const table = section.content as ArtifactTable;
    const header = table.columns.join(",");
    const rows = table.rows.map((row) =>
      table.columns.map((col) => String(row[col] ?? "")).join(","),
    );
    return [header, ...rows].join("\n");
  }
  if (section.kind === "checklist" && section.content && "items" in section.content) {
    return section.content.items
      .map((item) => `${item.checked ? "[x]" : "[ ]"} ${item.label}`)
      .join("\n");
  }
  return "";
}
