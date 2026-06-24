/** Shared types and helpers for Glass IDE project file browser. */

export interface GlassIdeProjectEntry {
  relativePath: string;
  name: string;
  isDirectory: boolean;
}

export interface GlassIdeListProjectResponse {
  ok: boolean;
  entries?: GlassIdeProjectEntry[];
  error?: string;
}

export interface GlassIdeReadProjectFileResponse {
  ok: boolean;
  content?: string;
  relativePath?: string;
  language?: string;
  truncated?: boolean;
  error?: string;
}

export interface GlassIdeWriteProjectFileResponse {
  ok: boolean;
  relativePath?: string;
  error?: string;
}

export const GLASS_IDE_SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".glass-index",
  ".next",
  "coverage",
  "target",
  "__pycache__",
  ".venv",
  "venv",
]);

export const GLASS_IDE_MAX_LIST_FILES = 800;
export const GLASS_IDE_MAX_FILE_BYTES = 512 * 1024;
/** @deprecated use GLASS_IDE_MAX_FILE_BYTES */
export const GLASS_IDE_MAX_READ_BYTES = GLASS_IDE_MAX_FILE_BYTES;

export function extensionFromRelativePath(relativePath: string): string {
  const base = relativePath.split("/").pop() ?? relativePath;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot).toLowerCase() : "";
}

export function languageFromExtension(ext: string): string {
  switch (ext) {
    case ".ts":
    case ".tsx":
      return "typescript";
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".py":
      return "python";
    case ".go":
      return "go";
    case ".rs":
      return "rust";
    case ".css":
    case ".scss":
      return "css";
    case ".html":
    case ".htm":
      return "html";
    case ".json":
      return "json";
    case ".md":
    case ".mdx":
      return "markdown";
    case ".sh":
    case ".bash":
      return "shell";
    case ".yaml":
    case ".yml":
      return "yaml";
    case ".sql":
      return "sql";
    default:
      return "plain";
  }
}

export function languageFromRelativePath(relativePath: string): string {
  return languageFromExtension(extensionFromRelativePath(relativePath));
}
