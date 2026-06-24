/**
 * Code-aware context reader for IIVO Glass.
 *
 * When the user is in a known editor (Cursor, VS Code, Xcode, etc.) this
 * module tries to determine the active file, its language, and (optionally)
 * reads a slice of its content so Glass can answer code questions without
 * the user having to copy-paste anything.
 *
 * Strategy (best-effort, never throws):
 *  1. Parse filename from window title (works for all Electron editors).
 *  2. Detect programming language from the file extension.
 *  3. Locate the file on disk via a fast `find` in the likely repo root.
 *  4. Read up to MAX_READ_CHARS of the file for AI context.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CodeContext {
  /** Raw filename from window title (e.g. "index.ts") */
  fileName: string;
  /** Inferred language (e.g. "TypeScript") */
  language: string;
  /** Absolute file path if found on disk, otherwise null */
  filePath: string | null;
  /** File content excerpt (first MAX_READ_CHARS chars), or null */
  content: string | null;
  /** Total file size in bytes (before truncation), or null */
  fileSizeBytes: number | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

/** Max characters read from a source file (roughly 4 KB). */
const MAX_READ_CHARS = 4_000;

/** Max time (ms) for the file-search `find` call. */
const FIND_TIMEOUT_MS = 2_000;

// ─── Known editors ────────────────────────────────────────────────────────────

/**
 * Apps whose window titles reliably contain the active filename.
 * Value = display name used in context output.
 */
const EDITOR_APPS: Record<string, string> = {
  Cursor: "Cursor",
  Code: "VS Code",
  "Visual Studio Code": "VS Code",
  Xcode: "Xcode",
  WebStorm: "WebStorm",
  "IntelliJ IDEA": "IntelliJ",
  PyCharm: "PyCharm",
  GoLand: "GoLand",
  CLion: "CLion",
  RubyMine: "RubyMine",
  Nova: "Nova",
  "Sublime Text": "Sublime Text",
  Zed: "Zed",
};

// ─── Language map ─────────────────────────────────────────────────────────────

const EXTENSION_LANGUAGE: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript (React)",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript (React)",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".pyi": "Python",
  ".rs": "Rust",
  ".go": "Go",
  ".swift": "Swift",
  ".java": "Java",
  ".kt": "Kotlin",
  ".kts": "Kotlin Script",
  ".rb": "Ruby",
  ".cs": "C#",
  ".c": "C",
  ".cpp": "C++",
  ".cc": "C++",
  ".cxx": "C++",
  ".h": "C/C++ Header",
  ".hpp": "C++ Header",
  ".m": "Objective-C",
  ".mm": "Objective-C++",
  ".css": "CSS",
  ".scss": "SCSS",
  ".sass": "Sass",
  ".less": "Less",
  ".html": "HTML",
  ".htm": "HTML",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".json": "JSON",
  ".jsonc": "JSON with Comments",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".toml": "TOML",
  ".xml": "XML",
  ".md": "Markdown",
  ".mdx": "MDX",
  ".sh": "Bash",
  ".bash": "Bash",
  ".zsh": "Zsh",
  ".fish": "Fish",
  ".sql": "SQL",
  ".graphql": "GraphQL",
  ".gql": "GraphQL",
  ".proto": "Protocol Buffers",
  ".tf": "Terraform",
  ".hcl": "HCL",
  ".dockerfile": "Dockerfile",
  ".nix": "Nix",
  ".lua": "Lua",
  ".r": "R",
  ".R": "R",
  ".dart": "Dart",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".erl": "Erlang",
  ".hs": "Haskell",
  ".clj": "Clojure",
  ".scala": "Scala",
  ".php": "PHP",
  ".pl": "Perl",
  ".pm": "Perl",
  ".jl": "Julia",
  ".zig": "Zig",
};

// ─── Window title parsing ─────────────────────────────────────────────────────

/**
 * Most editors show:  "filename.ext — subfolder — workspace — App Name"
 * or:                 "filename.ext • App Name"
 * or Xcode:          "ProjectName — filename.ext"
 *
 * Returns the filename part if it looks like a real file (has an extension),
 * otherwise null.
 */
export function parseFileNameFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;

  // Split on common delimiters used by editors
  const parts = title
    .split(/\s*[—–•|·]\s*|\s+-\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  for (const part of parts) {
    // Accept if it looks like a filename (has an extension, no spaces after last dot)
    const match = part.match(/^(.+?)(\.[a-zA-Z0-9]+)$/);
    if (match) {
      const ext = match[2].toLowerCase();
      // Only return if extension is in our known list (avoids grabbing workspace names)
      if (ext in EXTENSION_LANGUAGE || ext === ".json" || ext === ".md") {
        return part;
      }
    }
  }

  return null;
}

/**
 * Returns human-readable language from a filename or extension.
 */
export function detectLanguage(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  // Special-case Dockerfile (no extension)
  if (fileName.toLowerCase() === "dockerfile") return "Dockerfile";
  return EXTENSION_LANGUAGE[ext] ?? `Unknown (${ext || "no ext"})`;
}

// ─── File finder ─────────────────────────────────────────────────────────────

/**
 * Try to find a file by name within likely repo roots.
 * Uses a fast `find` with a timeout so it never blocks Glass.
 */
async function findFileOnDisk(
  fileName: string,
  hintPaths: string[],
): Promise<string | null> {
  // Build search roots: provided hints + home dir (capped)
  const roots = [
    ...hintPaths.filter((p) => p.length > 0),
    os.homedir(),
  ].slice(0, 4);

  for (const root of roots) {
    try {
      const { stdout } = await Promise.race([
        execFileAsync("find", [
          root,
          "-maxdepth", "8",
          "-name", fileName,
          "-not", "-path", "*/node_modules/*",
          "-not", "-path", "*/.git/*",
          "-not", "-path", "*/dist/*",
          "-not", "-path", "*/build/*",
          "-not", "-path", "*/.next/*",
          "-not", "-path", "*/target/*",
          "-print",
          "-quit",
        ]),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("find timeout")), FIND_TIMEOUT_MS),
        ),
      ]);
      const found = stdout.trim().split("\n")[0]?.trim();
      if (found) return found;
    } catch {
      // timeout or permission error — skip this root
    }
  }

  return null;
}

// ─── File reader ─────────────────────────────────────────────────────────────

async function readFileSafe(
  filePath: string,
): Promise<{ content: string; sizeBytes: number } | null> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;
    const sizeBytes = stat.size;
    // Don't bother reading huge files — the slice won't be useful
    const raw = await fs.readFile(filePath, "utf-8");
    const content = raw.length > MAX_READ_CHARS
      ? raw.slice(0, MAX_READ_CHARS) + `\n… [truncated — showing first ${MAX_READ_CHARS} chars of ${raw.length}]`
      : raw;
    return { content, sizeBytes };
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether the given app is a known code editor.
 */
export function isEditorApp(appName: string | null | undefined): boolean {
  if (!appName) return false;
  return appName in EDITOR_APPS;
}

/**
 * Main entry point: given the frontmost app name + window title + optional
 * hint paths (e.g. git repo root from Wingman), return rich code context.
 *
 * Always resolves (never rejects). Returns null if not in a known editor or
 * no file can be identified.
 */
export async function readCodeContext(opts: {
  appName: string | null | undefined;
  windowTitle: string | null | undefined;
  hintPaths?: string[];
}): Promise<CodeContext | null> {
  const { appName, windowTitle, hintPaths = [] } = opts;

  if (!isEditorApp(appName)) return null;

  const fileName = parseFileNameFromTitle(windowTitle);
  if (!fileName) return null;

  const language = detectLanguage(fileName);

  // Try to find the actual file
  let filePath: string | null = null;
  let content: string | null = null;
  let fileSizeBytes: number | null = null;

  try {
    filePath = await findFileOnDisk(fileName, hintPaths);
    if (filePath) {
      const read = await readFileSafe(filePath);
      if (read) {
        content = read.content;
        fileSizeBytes = read.sizeBytes;
      }
    }
  } catch {
    // best-effort — silently ignore
  }

  return {
    fileName,
    language,
    filePath,
    content,
    fileSizeBytes,
  };
}

/**
 * Format a CodeContext into a human-readable string for the AI context prefix.
 */
export function formatCodeContext(ctx: CodeContext): string {
  const lines: string[] = [];
  lines.push(`Active file: ${ctx.fileName} (${ctx.language})`);
  if (ctx.filePath) {
    lines.push(`Path: ${ctx.filePath}`);
  }
  if (ctx.content) {
    lines.push(`\`\`\`${ctx.language.toLowerCase().replace(/[^a-z+]/g, "")}\n${ctx.content}\n\`\`\``);
  }
  return lines.join("\n");
}
