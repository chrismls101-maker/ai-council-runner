/**
 * Pure validation helpers for scrollback IPC payloads (no native deps — testable in node:test).
 */

export interface ScrollbackWriteBlock {
  sessionId: string;
  command: string;
  output: string;
  exitCode?: number;
  status: "success" | "error" | "unknown";
  cwd?: string;
  startedAt: number;
  durationMs?: number;
}

const VALID_STATUSES = new Set<ScrollbackWriteBlock["status"]>(["success", "error", "unknown"]);
const MAX_COMMAND_LEN = 4000;
const MAX_OUTPUT_LEN = 2000;

function normalizeStatus(value: unknown): ScrollbackWriteBlock["status"] {
  return typeof value === "string" && VALID_STATUSES.has(value as ScrollbackWriteBlock["status"])
    ? (value as ScrollbackWriteBlock["status"])
    : "unknown";
}

/** Validate and cap blocks pushed from the terminal renderer. */
export function normalizeScrollbackWriteBlocks(blocks: unknown[]): ScrollbackWriteBlock[] {
  const out: ScrollbackWriteBlock[] = [];
  for (const raw of blocks) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Record<string, unknown>;
    const sessionId = typeof b.sessionId === "string" ? b.sessionId.trim() : "";
    if (!sessionId || sessionId === "unknown") continue;
    const command = typeof b.command === "string" ? b.command.slice(0, MAX_COMMAND_LEN).trim() : "";
    if (!command) continue;
    const output = typeof b.output === "string" ? b.output.slice(0, MAX_OUTPUT_LEN) : "";
    const exitCode = typeof b.exitCode === "number" && Number.isFinite(b.exitCode)
      ? Math.trunc(b.exitCode)
      : undefined;
    const startedAt = typeof b.startedAt === "number" && Number.isFinite(b.startedAt)
      ? b.startedAt
      : Date.now();
    const durationMs = typeof b.durationMs === "number" && Number.isFinite(b.durationMs) && b.durationMs >= 0
      ? b.durationMs
      : undefined;
    const cwd = typeof b.cwd === "string" && b.cwd.trim() ? b.cwd.trim().slice(0, 500) : undefined;
    out.push({
      sessionId,
      command,
      output,
      exitCode,
      status: normalizeStatus(b.status),
      cwd,
      startedAt,
      durationMs,
    });
  }
  return out;
}

/** Parse Claude's JSON array of row IDs (numbers or numeric strings). */
export function parseScrollbackSearchIds(parsed: unknown): number[] {
  if (!Array.isArray(parsed)) return [];
  const ids: number[] = [];
  for (const raw of parsed) {
    const id = typeof raw === "number" ? raw : parseInt(String(raw), 10);
    if (Number.isFinite(id) && id > 0) ids.push(Math.trunc(id));
  }
  return ids;
}
