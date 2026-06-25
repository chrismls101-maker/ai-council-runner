/**
 * Terminal Auto Fix — prompt builder (Task #65).
 *
 * Given a failed command + output, asks Claude for:
 *   1. The corrected command (single line, immediately runnable)
 *   2. A one-line diagnosis (what went wrong)
 *   3. A one-line what-changed (what the fix does differently)
 *
 * The response MUST follow a strict 3-line format so we can parse it reliably.
 */

const MAX_OUTPUT_CHARS = 4_000;
const MAX_CONTEXT_CHARS = 1_200;

export type TerminalFailureCategory =
  | "npm_install"
  | "git_merge_conflict"
  | "permission_denied"
  | "port_in_use"
  | "pip_conflict"
  | "disk_full"
  | "command_not_found"
  | "timeout"
  | "generic";

const CATEGORY_HINTS: Record<TerminalFailureCategory, string> = {
  npm_install:
    "npm: prefer `npm install <missing-package>`, fix package name typo, use `nvm use <version>` / `fnm use` when EBADENGINE or engine node mismatch, or `npm install --legacy-peer-deps` only for peer-deps conflict.",
  git_merge_conflict:
    "git merge: suggest `git status`, edit conflicted files, then `git add` + `git merge --continue` OR `git merge --abort`. Never suggest force-push unless user explicitly asked.",
  permission_denied:
    "EACCES/permission denied: fix ownership with `sudo chown -R $(whoami) <path>` or chmod; avoid sudo on npm global installs — use nvm instead.",
  port_in_use:
    "EADDRINUSE: find process with `lsof -i :<port>` or `lsof -nP -iTCP:<port> -sTCP:LISTEN`, then `kill <pid>` or change the app port flag.",
  pip_conflict:
    "pip: resolve version conflicts with compatible pins, `pip install 'pkg>=x,<y'`, or a fresh venv; mention `pip install --upgrade pip` only when relevant.",
  disk_full:
    "ENOSPC/disk full: free space with `df -h`, remove large files/cache (`npm cache clean --force`, Docker prune), never delete system paths blindly.",
  command_not_found:
    "command not found: fix typo in CLI name, suggest `brew install <pkg>` on macOS, or add tool to PATH; give the exact corrected command.",
  timeout:
    "timeout/hung: suggest retry with explicit timeout (`gtimeout`/`timeout`), fix blocking URL/host, or increase client timeout; if interrupted (130), say user cancelled.",
  generic:
    "Give one concrete corrected command for macOS zsh. Prefer fixing flags, paths, env vars, or missing deps over generic advice.",
};

/** Classify common failure modes so the model gets targeted repair guidance. */
export function detectTerminalFailureCategory(
  command: string,
  output: string,
  exitCode: number,
): TerminalFailureCategory {
  const blob = `${command}\n${output}`.toLowerCase();

  if (
    /\beaddrinuse\b|address already in use|port.*already in use|listen eaddrinuse/.test(blob)
  ) {
    return "port_in_use";
  }
  if (
    /\benospc\b|no space left on device|disk full|not enough space/.test(blob)
  ) {
    return "disk_full";
  }
  if (
    /\beacces\b|permission denied|operation not permitted/.test(blob)
  ) {
    return "permission_denied";
  }
  if (
    /command not found|not recognized as an internal or external command|no such file or directory:.*\/bin\//.test(
      blob,
    ) &&
    !/\bnpm\b/.test(command)
  ) {
    return "command_not_found";
  }
  if (
    /\bmerge conflict\b|conflict in |both modified|fix conflicts and then run|unmerged paths/.test(
      blob,
    ) ||
    /\bgit (merge|pull|rebase)\b/.test(command.toLowerCase())
  ) {
    return "git_merge_conflict";
  }
  if (
    /\bnpm\s+(err!|error)\b|npm error|enoent.*package|could not be found.*npm|ebadengine|engine node/.test(
      blob,
    ) ||
    /\bnpm (install|ci|i)\b/.test(command.toLowerCase())
  ) {
    return "npm_install";
  }
  if (
    /\bpip\b|pip3|resolutionimpossible|could not find a version|dependency resolver|conflicting dependencies/.test(
      blob,
    )
  ) {
    return "pip_conflict";
  }
  if (
    exitCode === 124 ||
    /\btimed out\b|timeout expired|operation timed out|deadline exceeded/.test(blob) ||
    /\b(timeout|gtimeout)\b/.test(command.toLowerCase())
  ) {
    return "timeout";
  }
  if (exitCode === 130 && /\bsleep\b|hang|curl\b|wget\b/.test(command.toLowerCase())) {
    return "timeout";
  }

  return "generic";
}

export function buildTerminalFixPrompt(
  command: string,
  output: string,
  exitCode: number,
  context?: string,
): string {
  const truncatedOutput =
    output.length > MAX_OUTPUT_CHARS
      ? "…" + output.slice(-(MAX_OUTPUT_CHARS - 1))
      : output;

  const category = detectTerminalFailureCategory(command, output, exitCode);
  const categoryHint = CATEGORY_HINTS[category];

  const contextSection =
    context && context.trim()
      ? `\n## Recent terminal context\n${context.trim().slice(0, MAX_CONTEXT_CHARS)}\n`
      : "";

  return `You are a terminal error repair expert for macOS / zsh.

A command failed (exit code ${exitCode}). Your job: return EXACTLY 3 lines, nothing else.

LINE 1: The corrected command, ready to run. If the original command is correct but the environment needs setup first, provide the setup command instead.
LINE 2: One sentence (≤ 12 words) — what went wrong.
LINE 3: One sentence (≤ 12 words) — what the fix does differently.

Rules:
- Line 1 must be a real, runnable shell command. No backticks, no markdown.
- Lines 2 and 3 must be plain text. No quotes around them.
- Prefer minimal, safe fixes. Do not suggest destructive commands (rm -rf /, git push --force) unless unavoidable.
- If the command is not fixable, output:
  [no fix]
  [reason in one sentence]
  [empty line]
- Output ONLY these 3 lines. No preamble. No explanation. No trailing text.

Failure category: ${category}
Category guidance: ${categoryHint}
${contextSection}
## Failed command
\`\`\`
${command}
\`\`\`

## Terminal output (exit ${exitCode})
\`\`\`
${truncatedOutput}
\`\`\``;
}

export interface ParsedTerminalFix {
  fixedCommand: string | null;
  diagnosis: string | null;
  whatChanged: string | null;
}

/**
 * Parse the strict 3-line model response into structured fields.
 * Returns nulls if the response indicates no fix or is malformed.
 */
export function parseTerminalFixResponse(raw: string): ParsedTerminalFix {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { fixedCommand: null, diagnosis: null, whatChanged: null };
  }

  const line1 = lines[0] ?? "";
  const line2 = lines[1] ?? "";
  const line3 = lines[2] ?? "";

  // "no fix" sentinel
  if (line1.toLowerCase().startsWith("[no fix]")) {
    return { fixedCommand: null, diagnosis: line2 || null, whatChanged: null };
  }

  // Strip any accidental backtick fencing
  const fixedCommand = line1.replace(/^`+|`+$/g, "").trim() || null;
  const diagnosis = line2 || null;
  const whatChanged = line3 || null;

  return { fixedCommand, diagnosis, whatChanged };
}
