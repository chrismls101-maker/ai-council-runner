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
- If the command is not fixable, output:
  [no fix]
  [reason in one sentence]
  [empty line]
- Output ONLY these 3 lines. No preamble. No explanation. No trailing text.
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
