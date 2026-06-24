/**
 * Glass IDE — inspect cluster row formatting (pure).
 */

import type { CoderTranscriptToolItem } from "./glassIdeCoderTranscript.ts";

export interface InspectClusterRow {
  id: string;
  toolName: string;
  relativePath: string | null;
  detail: string | null;
  openPath: string | null;
}

function basename(filePath: string): string {
  const trimmed = filePath.trim().replace(/\/+$/, "");
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || trimmed;
}

function normalizeOpenPath(relativePath?: string): string | null {
  const p = relativePath?.trim().replace(/\\/g, "/");
  if (!p) return null;
  if (p.startsWith("/")) {
    const parts = p.split("/");
    return parts.slice(-3).join("/");
  }
  return p;
}

function readFileDetail(tool: CoderTranscriptToolItem): string | null {
  if (!tool.result) return null;
  const lines = tool.result.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return null;
  return `${lines.length} line${lines.length === 1 ? "" : "s"}`;
}

function searchFilesDetail(tool: CoderTranscriptToolItem): string | null {
  const patternMatch = tool.label.match(/^Searched for (.+)$/);
  const pattern = patternMatch?.[1]?.trim();
  const matchCount = tool.result
    ? tool.result.split("\n").filter((l) => l.trim().length > 0).length
    : 0;
  if (pattern && matchCount > 0) {
    return `"${pattern}" · ${matchCount} match${matchCount === 1 ? "" : "es"}`;
  }
  if (pattern) return `"${pattern}"`;
  if (matchCount > 0) return `${matchCount} match${matchCount === 1 ? "" : "es"}`;
  return tool.result?.trim() ? "No matches" : null;
}

export function deriveInspectClusterRows(
  tools: CoderTranscriptToolItem[],
): InspectClusterRow[] {
  return tools.map((tool) => {
    const openPath = normalizeOpenPath(tool.relativePath);
    let detail: string | null = null;

    switch (tool.toolName) {
      case "read_file":
        detail = readFileDetail(tool);
        break;
      case "search_files":
        detail = searchFilesDetail(tool);
        break;
      case "list_directory":
        detail = tool.result?.split("\n").length
          ? `${tool.result.split("\n").filter(Boolean).length} entries`
          : null;
        break;
      case "web_search":
        detail = tool.label.replace(/^Search web:\s*/, "").trim() || null;
        break;
      default:
        detail = tool.result?.split("\n")[0]?.slice(0, 120) ?? null;
    }

    const displayPath = openPath ?? (tool.relativePath ? basename(tool.relativePath) : null);

    return {
      id: tool.id,
      toolName: tool.toolName,
      relativePath: displayPath,
      detail,
      openPath: tool.toolName === "read_file" ? openPath : openPath,
    };
  });
}
