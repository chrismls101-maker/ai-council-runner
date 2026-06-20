/**
 * Rolling buffer of recent built-in terminal commands.
 * Populated via IPC from GlassTerminalPanel; consumed by the AI ask path.
 */

import type { TerminalContextBlock } from "../shared/ipc.ts";

const MAX_BLOCKS = 15;
const MAX_COMMAND_LEN = 2000;
const MAX_OUTPUT_LEN = 2000;

const VALID_STATUSES = new Set<TerminalContextBlock["status"]>(["success", "error", "unknown"]);

let recentBlocks: TerminalContextBlock[] = [];
let lastUpdated: number | null = null;

function normalizeStatus(value: unknown): TerminalContextBlock["status"] {
  return typeof value === "string" && VALID_STATUSES.has(value as TerminalContextBlock["status"])
    ? (value as TerminalContextBlock["status"])
    : "unknown";
}

/** Validate and cap blocks pushed from the terminal renderer. */
export function normalizeTerminalContextBlocks(blocks: unknown[]): TerminalContextBlock[] {
  const out: TerminalContextBlock[] = [];
  for (const raw of blocks.slice(-MAX_BLOCKS)) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Record<string, unknown>;
    const command = typeof b.command === "string" ? b.command.slice(0, MAX_COMMAND_LEN).trim() : "";
    if (!command) continue;
    const output = typeof b.output === "string" ? b.output.slice(0, MAX_OUTPUT_LEN) : "";
    const exitCode = typeof b.exitCode === "number" && Number.isFinite(b.exitCode)
      ? Math.trunc(b.exitCode)
      : undefined;
    const durationMs = typeof b.durationMs === "number" && Number.isFinite(b.durationMs) && b.durationMs >= 0
      ? b.durationMs
      : undefined;
    out.push({
      command,
      output,
      exitCode,
      status: normalizeStatus(b.status),
      durationMs,
    });
  }
  return out;
}

export function pushTerminalContext(blocks: TerminalContextBlock[]): void {
  recentBlocks = blocks.slice(-MAX_BLOCKS);
  lastUpdated = Date.now();
}

export function clearTerminalContext(): void {
  recentBlocks = [];
  lastUpdated = null;
}

/**
 * Returns a human-readable summary of recent terminal activity,
 * suitable for appending to the AI `userContext` field.
 * Returns null if no blocks are available or they're stale (>10 min).
 */
export function getTerminalContextString(): string | null {
  if (recentBlocks.length === 0) return null;
  // Don't inject context older than 10 minutes — it's probably irrelevant
  if (lastUpdated && Date.now() - lastUpdated > 10 * 60 * 1000) return null;

  const lines = recentBlocks.map((b) => {
    const status =
      b.status === "success" ? "✓" :
      b.status === "error"   ? `✗${b.exitCode != null ? ` (exit ${b.exitCode})` : ""}` :
      "○";
    const duration = b.durationMs != null ? ` [${(b.durationMs / 1000).toFixed(1)}s]` : "";
    const outputSnippet = b.output
      ? `\n  └ ${b.output.slice(0, 400).replace(/\n/g, "\n    ")}${b.output.length > 400 ? "…" : ""}`
      : "";
    return `$ ${b.command} ${status}${duration}${outputSnippet}`;
  });

  return [
    "--- Built-in terminal session (recent commands) ---",
    ...lines,
    "---",
  ].join("\n");
}
