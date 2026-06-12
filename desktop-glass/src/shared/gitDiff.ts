/**
 * IIVO Glass — Git diff integration for Wingman Mode.
 *
 * When a Wingman session ends, Glass reads the git diff between the session
 * start commit and the current working tree. This answers: "Did the code
 * changes match the goal I set?"
 *
 * Pure module — no fs/electron imports. All I/O happens in main/index.ts.
 * This file contains only types, parsers, and analysis logic.
 *
 * Privacy contract:
 *   - Only file paths + line counts are used (not file content)
 *   - Nothing is sent to any server; all analysis is on-device
 *   - Diff is only captured if a git repo was detected at session start
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type FileStatus = "modified" | "added" | "deleted" | "renamed";

/**
 * How well the code changes match the session goal.
 *   on-track          — all changed dirs are plausibly related to the goal
 *   possible-drift    — ≤25% of files are in unrelated directories
 *   significant-drift — >25% of files appear outside the goal's scope
 *   unknown           — no changes, or goal too vague to analyse
 */
export type ScopeMatchHint =
  | "on-track"
  | "possible-drift"
  | "significant-drift"
  | "unknown";

export interface GitFileChange {
  /** Relative path from repo root, e.g. "src/auth/login.ts" */
  path: string;
  /** Parent directory, e.g. "src/auth" */
  directory: string;
  insertions: number;
  deletions: number;
  isBinary: boolean;
  status: FileStatus;
}

export interface GitDiffSummary {
  /** Absolute path to the repo root */
  repoPath: string;
  /** The commit SHA we diffed from (captured at session start) */
  baseRef: string;
  filesChanged: GitFileChange[];
  totalInsertions: number;
  totalDeletions: number;
  /** Top directories sorted by total lines changed, max 5 */
  topDirectories: string[];
  scopeHint: ScopeMatchHint;
  /** Human-readable explanation of the scope analysis */
  scopeNote: string;
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

/**
 * Parse the output of `git diff --numstat <ref>`.
 *
 * Format per line: "<insertions>\t<deletions>\t<path>"
 * Binary files:    "-\t-\t<path>"
 * Renames:         "<ins>\t<del>\t{old => new}"  (handled as modified path)
 */
export function parseGitNumstat(
  output: string,
): Array<{ path: string; insertions: number; deletions: number; isBinary: boolean }> {
  const results: Array<{
    path: string;
    insertions: number;
    deletions: number;
    isBinary: boolean;
  }> = [];

  for (const raw of output.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const tabIdx1 = line.indexOf("\t");
    const tabIdx2 = line.indexOf("\t", tabIdx1 + 1);
    if (tabIdx1 === -1 || tabIdx2 === -1) continue;

    const insPart = line.slice(0, tabIdx1);
    const delPart = line.slice(tabIdx1 + 1, tabIdx2);
    let path = line.slice(tabIdx2 + 1);

    // Resolve rename notation "{old => new}" → use "new" path
    const renameMatch = path.match(/^(.*?)\{.*? => (.*?)\}(.*)$/);
    if (renameMatch) {
      path = `${renameMatch[1]}${renameMatch[2]}${renameMatch[3]}`.replace(/\/\//g, "/");
    }

    if (insPart === "-") {
      results.push({ path, insertions: 0, deletions: 0, isBinary: true });
      continue;
    }

    const insertions = parseInt(insPart, 10);
    const deletions = parseInt(delPart, 10);
    if (isNaN(insertions) || isNaN(deletions)) continue;

    results.push({ path, insertions, deletions, isBinary: false });
  }

  return results;
}

/**
 * Parse the output of `git diff --name-status <ref>`.
 *
 * Format: "<status>\t<path>" or "R<score>\t<old>\t<new>"
 * Returns a map of path → FileStatus.
 */
export function parseGitNameStatus(output: string): Map<string, FileStatus> {
  const statusMap = new Map<string, FileStatus>();

  for (const raw of output.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const parts = line.split("\t");
    if (parts.length < 2) continue;

    const [code, p1, p2] = parts;
    const letter = code.charAt(0).toUpperCase();

    let status: FileStatus;
    switch (letter) {
      case "A":
        status = "added";
        break;
      case "D":
        status = "deleted";
        break;
      case "R":
        status = "renamed";
        break;
      default:
        status = "modified";
    }

    if (letter === "R" && p2) {
      // Map new path → renamed; old path → deleted
      statusMap.set(p2, "renamed");
      statusMap.set(p1, "deleted");
    } else {
      statusMap.set(p1, status);
    }
  }

  return statusMap;
}

// ─── Summary builder ──────────────────────────────────────────────────────────

function fileDirectory(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash > 0 ? path.slice(0, lastSlash) : ".";
}

/**
 * Merge numstat + name-status output into a full GitDiffSummary.
 * Scope analysis is run inline using the provided goal string.
 */
export function buildGitDiffSummary(
  numstatOutput: string,
  nameStatusOutput: string,
  repoPath: string,
  baseRef: string,
  goal: string,
): GitDiffSummary {
  const numstatEntries = parseGitNumstat(numstatOutput);
  const statusMap = parseGitNameStatus(nameStatusOutput);

  const filesChanged: GitFileChange[] = numstatEntries.map((e) => ({
    path: e.path,
    directory: fileDirectory(e.path),
    insertions: e.insertions,
    deletions: e.deletions,
    isBinary: e.isBinary,
    status: statusMap.get(e.path) ?? "modified",
  }));

  const totalInsertions = filesChanged.reduce((s, f) => s + f.insertions, 0);
  const totalDeletions = filesChanged.reduce((s, f) => s + f.deletions, 0);

  // Top directories by total change volume
  const dirVolume = new Map<string, number>();
  for (const f of filesChanged) {
    const v = (dirVolume.get(f.directory) ?? 0) + f.insertions + f.deletions;
    dirVolume.set(f.directory, v);
  }
  const topDirectories = [...dirVolume.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([dir]) => dir);

  const { scopeHint, scopeNote } = analyzeScopeMatch(goal, {
    filesChanged,
    totalInsertions,
    totalDeletions,
  });

  return {
    repoPath,
    baseRef,
    filesChanged,
    totalInsertions,
    totalDeletions,
    topDirectories,
    scopeHint,
    scopeNote,
  };
}

// ─── Scope analysis ───────────────────────────────────────────────────────────

/** Common English words that don't indicate scope. */
const STOP_WORDS = new Set([
  "fix", "the", "a", "an", "in", "on", "at", "to", "for", "of", "and", "or",
  "with", "add", "update", "change", "make", "build", "create", "write",
  "run", "debug", "check", "get", "set", "use", "from", "by", "that", "this",
  "is", "are", "was", "were", "be", "been", "have", "has", "had", "do",
  "does", "did", "not", "no", "so", "but", "if", "then", "when", "what",
  "how", "why", "which", "who", "need", "should", "would", "could", "also",
  "some", "all", "new", "old", "now", "after", "before", "during", "into",
  "out", "up", "down", "back", "just", "only", "still", "more", "than",
]);

/**
 * Determine whether the changed files are plausibly related to the session goal.
 * Uses keyword matching between goal terms and file paths/directories.
 *
 * Returns a hint + a human-readable note.
 */
export function analyzeScopeMatch(
  goal: string,
  summary: Pick<
    GitDiffSummary,
    "filesChanged" | "totalInsertions" | "totalDeletions"
  >,
): { scopeHint: ScopeMatchHint; scopeNote: string } {
  const nonBinary = summary.filesChanged.filter((f) => !f.isBinary);

  if (nonBinary.length === 0) {
    if (summary.filesChanged.length > 0) {
      return {
        scopeHint: "unknown",
        scopeNote: "Only binary files changed.",
      };
    }
    return {
      scopeHint: "unknown",
      scopeNote: "No files changed during this session.",
    };
  }

  // Extract meaningful terms from the goal
  const goalTerms = goal
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));

  if (goalTerms.length === 0) {
    return {
      scopeHint: "unknown",
      scopeNote: "Goal is too short or generic to analyse scope.",
    };
  }

  // For each file, check whether any goal term appears in its path
  const driftFiles: string[] = [];
  const matchFiles: string[] = [];

  for (const f of nonBinary) {
    const pathLower = f.path.toLowerCase();
    const matches = goalTerms.some((term) => pathLower.includes(term));
    if (matches) {
      matchFiles.push(f.path);
    } else {
      driftFiles.push(f.path);
    }
  }

  const total = nonBinary.length;
  const driftRatio = driftFiles.length / total;

  if (driftRatio === 0) {
    return {
      scopeHint: "on-track",
      scopeNote: `All ${total} changed file${total === 1 ? "" : "s"} appear related to the goal.`,
    };
  }

  if (driftRatio <= 0.25) {
    const examples = driftFiles.slice(0, 3).join(", ");
    const ellipsis = driftFiles.length > 3 ? `… (+${driftFiles.length - 3})` : "";
    return {
      scopeHint: "possible-drift",
      scopeNote: `${driftFiles.length} file${driftFiles.length === 1 ? "" : "s"} may be outside scope: ${examples}${ellipsis}.`,
    };
  }

  return {
    scopeHint: "significant-drift",
    scopeNote: `${driftFiles.length} of ${total} files appear unrelated to the goal. Review before merging.`,
  };
}

// ─── Prompt formatter ─────────────────────────────────────────────────────────

/**
 * Format a GitDiffSummary for inclusion in the Wingman AI report prompt.
 * Keeps output under ~50 lines to stay token-efficient.
 */
export function formatDiffForPrompt(summary: GitDiffSummary): string {
  if (summary.filesChanged.length === 0) {
    return "GIT DIFF\nNo code changes detected during this session.";
  }

  const lines: string[] = [
    "GIT DIFF (file paths + line counts only — no file content)",
    `${summary.filesChanged.length} file${summary.filesChanged.length === 1 ? "" : "s"} changed, ` +
      `${summary.totalInsertions} insertion${summary.totalInsertions === 1 ? "" : "s"}, ` +
      `${summary.totalDeletions} deletion${summary.totalDeletions === 1 ? "" : "s"}`,
    `Top directories: ${summary.topDirectories.join(", ") || "(root)"}`,
    `Scope: ${summary.scopeNote}`,
    "",
    "Files:",
  ];

  const statusSymbol: Record<FileStatus, string> = {
    modified: "M",
    added: "A",
    deleted: "D",
    renamed: "R",
  };

  // Show up to 25 files; summarise the rest
  const shown = summary.filesChanged.slice(0, 25);
  for (const f of shown) {
    const sym = statusSymbol[f.status];
    const counts = f.isBinary
      ? "(binary)"
      : `+${f.insertions} -${f.deletions}`;
    lines.push(`  ${sym} ${f.path} [${counts}]`);
  }

  if (summary.filesChanged.length > 25) {
    lines.push(`  … and ${summary.filesChanged.length - 25} more files`);
  }

  return lines.join("\n");
}

// ─── Repo discovery helpers ───────────────────────────────────────────────────

/**
 * Extract the project name from a VS Code / Cursor window title.
 *
 * Common title formats:
 *   "filename.ts — project-name — Visual Studio Code"
 *   "project-name — Cursor"
 *   "● filename.ts — project-name — Cursor"
 */
export function extractProjectNameFromTitle(title: string): string | null {
  // Strip leading ● (unsaved indicator)
  const clean = title.replace(/^●\s*/, "").trim();

  const patterns = [
    // "something — project — VS Code/Cursor"
    /—\s+([^—]+?)\s+—\s+(?:Visual Studio Code|Cursor|Code - OSS|Code)\s*$/,
    // "project — VS Code/Cursor" (no file prefix)
    /^([^—]+?)\s+—\s+(?:Visual Studio Code|Cursor|Code - OSS|Code)\s*$/,
    // "something — project" (generic two-part title)
    /—\s+([^—]{2,60})\s*$/,
  ];

  for (const re of patterns) {
    const m = clean.match(re);
    if (m) {
      const name = m[1].trim();
      // Sanity check — project names don't usually contain spaces or look like filenames
      if (name && name.length >= 2 && name.length < 80) {
        return name;
      }
    }
  }
  return null;
}

/**
 * Build an ordered list of filesystem paths to check for a git repo,
 * based on the project name extracted from window titles.
 *
 * homeDir should be the value of os.homedir() (passed in to keep this pure).
 */
export function buildRepoCandidatePaths(
  projectName: string,
  homeDir: string,
): string[] {
  const parents = [
    "Desktop",
    "Documents",
    "Projects",
    "projects",
    "code",
    "Code",
    "dev",
    "Developer",
    "src",
    "work",
    "repos",
    "github",
    "workspace",
    "Sites",
  ];

  const candidates: string[] = [];
  for (const parent of parents) {
    candidates.push(`${homeDir}/${parent}/${projectName}`);
  }
  // Also try directly under home
  candidates.push(`${homeDir}/${projectName}`);
  return candidates;
}

// ─── Diff short-ref helper ────────────────────────────────────────────────────

/** Shorten a full 40-char SHA to 7 chars for display. */
export function shortRef(ref: string): string {
  return ref.slice(0, 7);
}
