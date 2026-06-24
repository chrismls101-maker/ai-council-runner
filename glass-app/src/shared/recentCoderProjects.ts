/** Recent Glass Coder project folders — shown on IDE open. */

export const RECENT_CODER_PROJECTS_MAX = 8;

export function parseRecentCoderProjects(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const paths = value
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim())
    .filter((p) => p.startsWith("/") || p.startsWith("~/"));
  return paths.length ? paths.slice(0, RECENT_CODER_PROJECTS_MAX) : undefined;
}

export function touchRecentCoderProject(
  recent: string[] | undefined,
  folder: string,
): string[] {
  const trimmed = folder.trim();
  if (!trimmed) return recent ?? [];
  const without = (recent ?? []).filter((p) => p !== trimmed);
  return [trimmed, ...without].slice(0, RECENT_CODER_PROJECTS_MAX);
}

export function projectFolderLabel(folderPath: string): string {
  const normalized = folderPath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? folderPath;
}
