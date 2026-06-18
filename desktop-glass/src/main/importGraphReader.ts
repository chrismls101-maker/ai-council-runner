/**
 * Import-aware code context reader for IIVO Glass (#164).
 *
 * When Glass reads a file for AI context, this module also pulls in the files
 * that file imports — giving the AI a full picture of the component's
 * dependency surface without flooding the context with unrelated code.
 *
 * Strategy: smart depth-2 BFS with token-budget capping.
 *   • Depth-1: all direct project-local imports, prioritised by proximity
 *   • Depth-2: imports of depth-1 files, only if in same/parent directory
 *   • Hard cap: BUDGET_CHARS total across all imported files
 *   • Per-file cap: FILE_MAX_CHARS
 *   • Skipped always: node_modules, test files, generated files, binary assets
 *   • Deduplicated: each resolved path included at most once
 *
 * Only JS/TS/JSX/TSX and Python import syntax is supported.
 * Other languages fall back to zero imported files (graceful degradation).
 */

import fsp from "node:fs/promises";
import path from "node:path";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImportedFile {
  /** Absolute path on disk */
  filePath: string;
  /** Basename (e.g. "useAuth.ts") */
  fileName: string;
  /** Language label (mirrors codeContextReader) */
  language: string;
  /** Content, possibly truncated to FILE_MAX_CHARS */
  content: string;
  /** 0 = target file, 1 = direct import, 2 = import-of-import */
  depth: 1 | 2;
}

// ── Config ────────────────────────────────────────────────────────────────────

/** Total character budget across all imported files (≈ 8 k tokens). */
export const BUDGET_CHARS = 32_000;

/** Per-file character cap. */
export const FILE_MAX_CHARS = 4_000;

/** Maximum directory levels to walk up looking for project root marker. */
const PROJECT_ROOT_SEARCH_DEPTH = 8;

// ── Language map (mirrors codeContextReader) ─────────────────────────────────

const EXT_LANGUAGE: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript (React)",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript (React)",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
};

function langForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_LANGUAGE[ext] ?? "code";
}

// ── Skip rules ────────────────────────────────────────────────────────────────

/** Extensions we never read (assets, styles, data). */
const SKIP_EXTENSIONS = new Set([
  ".css", ".scss", ".sass", ".less",
  ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico",
  ".json", ".jsonc",
  ".woff", ".woff2", ".ttf", ".eot",
  ".mp3", ".mp4", ".wav", ".ogg",
  ".pdf", ".zip", ".tar", ".gz",
]);

/** Path segments that identify files we skip. */
const SKIP_SEGMENTS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next",
  "target", "__pycache__", ".cache",
]);

function shouldSkipPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (SKIP_EXTENSIONS.has(ext)) return true;

  // Skip test / spec / generated files
  const base = path.basename(filePath);
  if (/\.(test|spec|generated|gen)\.[a-z]+$/i.test(base)) return true;
  if (/\.d\.ts$/.test(base)) return true; // declaration files — skip (no implementation)

  // Skip any path containing a skip segment
  const parts = filePath.split(path.sep);
  return parts.some((seg) => SKIP_SEGMENTS.has(seg));
}

// ── Import path parser ────────────────────────────────────────────────────────

/**
 * Extract relative import paths from JS/TS/Python source.
 * Returns only paths that start with "./" or "../" — project-local only.
 * Absolute imports (from node_modules) are intentionally excluded.
 */
export function parseImports(content: string, sourceFilePath: string): string[] {
  const ext = path.extname(sourceFilePath).toLowerCase();
  const raw: string[] = [];

  if ([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    // ES module: `from '...'` (handles both single-line and multiline imports/exports)
    // Deliberately simple — bare specifier filtering happens at the end.
    const fromRe = /\bfrom\s*['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = fromRe.exec(content)) !== null) {
      const p = m[1];
      if (p !== undefined) raw.push(p);
    }

    // Side-effect imports: `import './y'`
    const sideEffectRe = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
    while ((m = sideEffectRe.exec(content)) !== null) {
      const p = m[1];
      if (p !== undefined) raw.push(p);
    }

    // Dynamic imports: import('./y')
    const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = dynamicRe.exec(content)) !== null) {
      const p = m[1];
      if (p !== undefined) raw.push(p);
    }

    // CommonJS require('./y')
    const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = requireRe.exec(content)) !== null) {
      const p = m[1];
      if (p !== undefined) raw.push(p);
    }
  } else if (ext === ".py") {
    // Relative Python imports: from .module import X / from ..pkg import Y
    const pyRe = /^from\s+(\.+[\w.]*)\s+import/gm;
    let m: RegExpExecArray | null;
    while ((m = pyRe.exec(content)) !== null) {
      const rel = m[1];
      if (rel !== undefined) {
        // Convert Python relative import to path: ".utils" → "./utils"
        const dots = rel.match(/^(\.+)/)?.[1] ?? ".";
        const modPart = rel.slice(dots.length).replace(/\./g, "/");
        const prefix = dots.length === 1 ? "./" : "../".repeat(dots.length - 1);
        raw.push(prefix + modPart);
      }
    }
  }

  // Filter: only relative paths
  return [...new Set(raw.filter((p) => p.startsWith("./") || p.startsWith("../")))];
}

// ── Path resolver ─────────────────────────────────────────────────────────────

/**
 * Given an importing file's directory and a relative import specifier,
 * resolve to an absolute path on disk by trying common extensions.
 * Returns null if the file cannot be found.
 */
export async function resolveImportPath(
  fromDir: string,
  importSpec: string,
): Promise<string | null> {
  const candidate = path.resolve(fromDir, importSpec);

  // If the import already has an extension and the file exists, use it
  if (path.extname(candidate)) {
    if (await existsSafe(candidate)) return candidate;
    return null;
  }

  // Try appending extensions
  const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs", ".py"];
  for (const ext of EXTS) {
    const p = candidate + ext;
    if (await existsSafe(p)) return p;
  }

  // Try as directory with index file
  for (const ext of EXTS) {
    const p = path.join(candidate, `index${ext}`);
    if (await existsSafe(p)) return p;
  }

  return null;
}

async function existsSafe(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

// ── Project root detection ────────────────────────────────────────────────────

/**
 * Walk up from startDir looking for package.json or tsconfig.json.
 * Returns the directory that contains the marker, or startDir if not found.
 */
export async function findProjectRoot(startDir: string): Promise<string> {
  let dir = startDir;
  const home = process.env["HOME"] ?? "/";

  for (let i = 0; i < PROJECT_ROOT_SEARCH_DEPTH; i++) {
    const hasPkg = await existsSafe(path.join(dir, "package.json"));
    const hasTsc = await existsSafe(path.join(dir, "tsconfig.json"));
    if (hasPkg || hasTsc) return dir;

    const parent = path.dirname(dir);
    if (parent === dir || dir === home) break;
    dir = parent;
  }

  return startDir;
}

// ── Priority scoring ──────────────────────────────────────────────────────────

/**
 * Lower score = higher priority.
 * Prioritises files closer to the target file.
 */
function priorityScore(
  importedPath: string,
  targetDir: string,
  projectRoot: string,
): number {
  const importedDir = path.dirname(importedPath);

  if (importedDir === targetDir) return 0;              // same directory
  if (targetDir.startsWith(importedDir + path.sep)) return 1; // parent dir
  if (importedDir.startsWith(targetDir + path.sep)) return 2; // child dir
  if (importedDir.startsWith(projectRoot + path.sep)) return 3; // project
  return 4;                                              // outside project
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Read the import graph of a source file up to depth 2.
 *
 * @param targetFilePath - Absolute path of the file being edited
 * @param targetContent  - Already-read content of the target file
 * @param opts.budgetChars - Character budget across all imports (default BUDGET_CHARS)
 * @param opts.maxDepth   - Max traversal depth: 1 or 2 (default 2)
 * @returns Array of ImportedFile, sorted by depth then priority
 */
export async function readImportGraph(
  targetFilePath: string,
  targetContent: string,
  opts: { budgetChars?: number; maxDepth?: 1 | 2 } = {},
): Promise<ImportedFile[]> {
  const budget = opts.budgetChars ?? BUDGET_CHARS;
  const maxDepth = opts.maxDepth ?? 2;
  const targetDir = path.dirname(targetFilePath);
  const projectRoot = await findProjectRoot(targetDir);

  const visited = new Set<string>([targetFilePath]);
  const results: ImportedFile[] = [];
  let remainingBudget = budget;

  // ── Depth-1: direct imports of the target file ────────────────────────────

  const depth1Paths = await resolveImportPaths(targetContent, targetFilePath);
  const depth1Prioritised = depth1Paths
    .filter((p) => !shouldSkipPath(p) && !visited.has(p))
    .sort((a, b) => priorityScore(a, targetDir, projectRoot) - priorityScore(b, targetDir, projectRoot));

  const depth1Resolved: string[] = [];

  for (const absPath of depth1Prioritised) {
    if (remainingBudget <= 0) break;
    visited.add(absPath);
    const file = await readImportedFile(absPath, 1, remainingBudget);
    if (!file) continue;
    results.push(file);
    remainingBudget -= file.content.length;
    depth1Resolved.push(absPath);
  }

  if (maxDepth < 2 || remainingBudget <= 0) return results;

  // ── Depth-2: imports of depth-1 files (same/parent dir only) ─────────────

  for (const d1Path of depth1Resolved) {
    if (remainingBudget <= 0) break;

    const d1Dir = path.dirname(d1Path);
    // Depth-2 restriction: only follow if the depth-1 file is in the same
    // directory as the target, a parent directory, or a child directory.
    const isCloseEnough =
      d1Dir === targetDir ||
      targetDir.startsWith(d1Dir + path.sep) ||
      d1Dir.startsWith(targetDir + path.sep);
    if (!isCloseEnough) continue;

    const d1Content = results.find((r) => r.filePath === d1Path)?.content ?? "";
    const depth2Paths = await resolveImportPaths(d1Content, d1Path);
    const depth2Prioritised = depth2Paths
      .filter((p) => !shouldSkipPath(p) && !visited.has(p))
      .sort((a, b) => priorityScore(a, targetDir, projectRoot) - priorityScore(b, targetDir, projectRoot));

    for (const absPath of depth2Prioritised) {
      if (remainingBudget <= 0) break;
      visited.add(absPath);
      const file = await readImportedFile(absPath, 2, remainingBudget);
      if (!file) continue;
      results.push(file);
      remainingBudget -= file.content.length;
    }
  }

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resolveImportPaths(
  content: string,
  fromFile: string,
): Promise<string[]> {
  const fromDir = path.dirname(fromFile);
  const specs = parseImports(content, fromFile);
  const resolved = await Promise.all(
    specs.map((spec) => resolveImportPath(fromDir, spec)),
  );
  return resolved.filter((p): p is string => p !== null);
}

async function readImportedFile(
  filePath: string,
  depth: 1 | 2,
  budgetRemaining: number,
): Promise<ImportedFile | null> {
  try {
    const raw = await fsp.readFile(filePath, "utf-8");
    const cap = Math.min(FILE_MAX_CHARS, budgetRemaining);
    const content =
      raw.length > cap
        ? raw.slice(0, cap) + `\n… [truncated — showing first ${cap} of ${raw.length} chars]`
        : raw;
    return {
      filePath,
      fileName: path.basename(filePath),
      language: langForPath(filePath),
      content,
      depth,
    };
  } catch {
    return null;
  }
}
