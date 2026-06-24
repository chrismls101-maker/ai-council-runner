/**
 * Git context for Glass Coder bootstrap — separate from Wingman gitDiff.
 * Read-only snapshot injected into the first agent message.
 */

export interface CoderGitFileStatus {
  path: string;
  status: string;
}

export interface CoderGitBootstrapInput {
  branch?: string;
  porcelainLines: string[];
  diffStatLines: string[];
}

const MAX_PORCELAIN_LINES = 40;
const MAX_DIFF_STAT_LINES = 25;

/** Parse `git status --porcelain` lines into path + XY status. */
export function parseGitPorcelain(output: string): CoderGitFileStatus[] {
  const out: CoderGitFileStatus[] = [];
  for (const raw of output.split("\n")) {
    const line = raw.trimEnd();
    if (!line || line.length < 4) continue;
    const status = line.slice(0, 2).trim() || line.slice(0, 1);
    let path = line.slice(3).trim();
    if (path.includes(" -> ")) {
      path = path.split(" -> ").pop()?.trim() ?? path;
    }
    if (!path) continue;
    out.push({ status, path });
  }
  return out;
}

export function formatCoderGitBootstrap(input: CoderGitBootstrapInput): string | undefined {
  const parts: string[] = [];
  if (input.branch?.trim()) {
    parts.push(`Branch: ${input.branch.trim()}`);
  }
  const files = input.porcelainLines
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .slice(0, MAX_PORCELAIN_LINES);
  if (files.length > 0) {
    parts.push("Git working tree (read-only snapshot):");
    for (const line of files) {
      parts.push(`  ${line}`);
    }
    if (input.porcelainLines.length > MAX_PORCELAIN_LINES) {
      parts.push(`  … and ${input.porcelainLines.length - MAX_PORCELAIN_LINES} more`);
    }
  }
  const stat = input.diffStatLines
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .slice(0, MAX_DIFF_STAT_LINES);
  if (stat.length > 0) {
    parts.push("Diff vs HEAD (stat):");
    for (const line of stat) {
      parts.push(`  ${line}`);
    }
  }
  if (parts.length === 0) return undefined;
  return parts.join("\n");
}
