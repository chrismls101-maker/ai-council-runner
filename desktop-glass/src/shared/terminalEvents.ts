/**
 * IIVO Glass — Wingman terminal event types and parser.
 *
 * When Wingman is active and a terminal window is visible, Glass reads its
 * output via the Accessibility API (read-only — no control, no injection).
 * This module defines event types and the pure parsing logic that classifies
 * terminal output into structured events.
 *
 * Privacy contract:
 *   - Terminal content is read only while a Wingman session is active
 *   - Only error/failure/success signal lines are retained — not raw output
 *   - Captured event text is trimmed to 200 chars max
 *   - Nothing is sent to any server; all processing is on-device
 *
 * Pure logic only — no fs/electron imports so it stays unit-testable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TerminalEventType =
  | "build_error"
  | "test_failure"
  | "runtime_error"
  | "build_success"
  | "test_pass";

export interface TerminalEvent {
  id: string;
  type: TerminalEventType;
  /** Human-readable label shown in the feed, e.g. "build error: null not assignable TS2345" */
  label: string;
  /** The raw snippet that triggered this event, trimmed to ≤200 chars. */
  snippet: string;
  timestamp: number;
  /** The terminal app this came from, e.g. "Terminal", "iTerm2", "Ghostty" */
  source: string;
}

// ---------------------------------------------------------------------------
// Detection patterns
// ---------------------------------------------------------------------------

/** TypeScript compiler errors: "error TS2345:", "error TS7006:", etc. */
const TS_ERROR_RE = /error\s+TS\d+:/i;

/** Generic "X errors" summary lines from tsc / eslint */
const ERROR_COUNT_RE = /\b(\d+)\s+errors?\b/i;

/** "FAIL src/…" from Jest / Vitest */
const JEST_FAIL_RE = /^FAIL\s+\S+/m;

/** "● Test suite failed to run" / "● some test name" from Jest */
const JEST_BULLET_RE = /^●\s+/m;

/** Node test runner failures: "not ok N -" */
const NODE_TEST_FAIL_RE = /^not ok\s+\d+/im;

/** "X passing, Y failing" from Mocha */
const MOCHA_FAIL_RE = /\d+\s+failing/i;

/** npm / yarn script failure */
const NPM_ERR_RE = /^npm\s+ERR!/im;

/** Uncaught exceptions / runtime crashes */
const UNCAUGHT_RE =
  /uncaught\s+(?:exception|error|reference|type|syntax|range)/i;

/** Generic stack trace indicator */
const STACK_TRACE_RE = /^\s+at\s+\S+\s+\(/m;

/** "Error:" prefix (Node runtime) */
const NODE_ERROR_RE = /^(?:Error|TypeError|ReferenceError|SyntaxError|RangeError):/im;

/** "✓ N passing" / "X passing" — success */
const PASS_RE = /(\d+)\s+passing/i;

/** "Tests: X passed" (Jest summary) */
const JEST_PASS_RE = /Tests:\s+\d+\s+passed/i;

/** "All tests passed" / "test suites: X passed" */
const ALL_PASS_RE = /all\s+tests?\s+passed?|test\s+suites?:\s+\d+\s+passed/i;

/** "Build succeeded" / "Compiled successfully" */
const BUILD_SUCCESS_RE =
  /build\s+succeeded?|compiled\s+successfully|webpack compiled\s+successfully|vite\s+v[\d.]+\s+built/i;

/** "ok N -" (node:test pass) */
const NODE_TEST_PASS_RE = /^ok\s+\d+/im;

// ---------------------------------------------------------------------------
// Event id generator (pure — no crypto dependency needed)
// ---------------------------------------------------------------------------

let _seq = 0;

function makeEventId(): string {
  return `te-${Date.now()}-${++_seq}`;
}

// ---------------------------------------------------------------------------
// Label formatters
// ---------------------------------------------------------------------------

/**
 * Extract the most meaningful first line from a terminal snippet for display
 * as a short label. Trims whitespace, removes ANSI codes, caps at 80 chars.
 */
export function formatTerminalSnippet(raw: string): string {
  // Strip ANSI escape codes
  // eslint-disable-next-line no-control-regex
  const clean = raw.replace(/\x1b\[[0-9;]*m/g, "").trim();
  const firstLine = clean.split(/\r?\n/)[0]?.trim() ?? clean;
  return firstLine.length > 80 ? firstLine.slice(0, 77) + "…" : firstLine;
}

/**
 * Build the short human-readable label shown in the Wingman feed.
 * Examples:
 *   "build error: null not assignable TS2345"
 *   "test fail: TypeError cannot read 'id'"
 *   "build pass: 9 tests passing"
 */
export function buildEventLabel(type: TerminalEventType, snippet: string): string {
  const short = formatTerminalSnippet(snippet);

  switch (type) {
    case "build_error":
      return `build error: ${short}`;
    case "test_failure":
      return `test fail: ${short}`;
    case "runtime_error":
      return `runtime error: ${short}`;
    case "build_success":
      return `build pass: ${short}`;
    case "test_pass":
      return `tests pass: ${short}`;
  }
}

// ---------------------------------------------------------------------------
// Core event builder
// ---------------------------------------------------------------------------

export function buildTerminalEvent(
  type: TerminalEventType,
  snippet: string,
  source: string,
  timestamp = Date.now(),
): TerminalEvent {
  const trimmedSnippet =
    snippet.length > 200 ? snippet.slice(0, 197) + "…" : snippet;
  return {
    id: makeEventId(),
    type,
    label: buildEventLabel(type, trimmedSnippet),
    snippet: trimmedSnippet,
    timestamp,
    source,
  };
}

// ---------------------------------------------------------------------------
// Deduplication helpers
// ---------------------------------------------------------------------------

/**
 * Returns a stable fingerprint for an event to detect duplicates.
 * Two events with the same type + first-50-chars of snippet within 60s = duplicate.
 */
export function terminalEventFingerprint(event: TerminalEvent): string {
  return `${event.type}:${event.snippet.slice(0, 50).toLowerCase().replace(/\s+/g, " ")}`;
}

/**
 * Returns true if a matching event already exists in the recent history
 * (same fingerprint within dedupeWindowMs, default 60 seconds).
 */
export function isDuplicateTerminalEvent(
  incoming: TerminalEvent,
  existing: TerminalEvent[],
  dedupeWindowMs = 60_000,
): boolean {
  const fingerprint = terminalEventFingerprint(incoming);
  const cutoff = incoming.timestamp - dedupeWindowMs;
  return existing.some(
    (e) =>
      e.timestamp >= cutoff &&
      terminalEventFingerprint(e) === fingerprint,
  );
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export interface ParseTerminalOutputOptions {
  source?: string;
  timestamp?: number;
  /** Existing events to check for deduplication. */
  existingEvents?: TerminalEvent[];
  /** Dedupe window in ms (default 60_000). */
  dedupeWindowMs?: number;
}

/**
 * Parse a chunk of terminal output text and return zero or more new events.
 *
 * Precedence (checked in order):
 *   1. TypeScript compiler errors
 *   2. Jest / Node test runner failures
 *   3. Generic runtime errors + stack traces
 *   4. npm script errors
 *   5. Build / test success signals
 *
 * Never returns more than one event per call — the most severe signal wins.
 * Deduplicates against existingEvents if provided.
 */
export function parseTerminalOutput(
  text: string,
  options: ParseTerminalOutputOptions = {},
): TerminalEvent[] {
  const {
    source = "Terminal",
    timestamp = Date.now(),
    existingEvents = [],
    dedupeWindowMs = 60_000,
  } = options;

  if (!text || !text.trim()) return [];

  let type: TerminalEventType | null = null;
  let snippet = "";

  // ── 1. TypeScript errors ──────────────────────────────────────────────────
  const tsMatch = text.match(TS_ERROR_RE);
  if (tsMatch) {
    type = "build_error";
    // Find the line containing the TS error for the snippet
    const line = text
      .split(/\r?\n/)
      .find((l) => TS_ERROR_RE.test(l)) ?? tsMatch[0];
    snippet = line.trim();
  }

  // ── 2. Error count summary (e.g. "3 errors") ─────────────────────────────
  if (!type) {
    const countMatch = text.match(ERROR_COUNT_RE);
    if (countMatch && parseInt(countMatch[1], 10) > 0) {
      type = "build_error";
      const line = text
        .split(/\r?\n/)
        .find((l) => ERROR_COUNT_RE.test(l)) ?? countMatch[0];
      snippet = line.trim();
    }
  }

  // ── 3. Jest / Vitest FAIL ─────────────────────────────────────────────────
  if (!type) {
    const jestFail = text.match(JEST_FAIL_RE);
    if (jestFail) {
      type = "test_failure";
      snippet = jestFail[0].trim();
    }
  }

  // ── 4. Jest bullet (● test name) ─────────────────────────────────────────
  if (!type) {
    const bullet = text.match(JEST_BULLET_RE);
    if (bullet) {
      type = "test_failure";
      const line = text
        .split(/\r?\n/)
        .find((l) => JEST_BULLET_RE.test(l)) ?? bullet[0];
      snippet = line.trim();
    }
  }

  // ── 5. Node test runner failures (not ok N) ───────────────────────────────
  if (!type) {
    const nodeFail = text.match(NODE_TEST_FAIL_RE);
    if (nodeFail) {
      type = "test_failure";
      snippet = nodeFail[0].trim();
    }
  }

  // ── 6. Mocha failures ────────────────────────────────────────────────────
  if (!type) {
    const mocha = text.match(MOCHA_FAIL_RE);
    if (mocha) {
      type = "test_failure";
      snippet = mocha[0].trim();
    }
  }

  // ── 7. Node runtime errors ───────────────────────────────────────────────
  if (!type) {
    const nodeErr = text.match(NODE_ERROR_RE);
    if (nodeErr) {
      type = "runtime_error";
      const line = text
        .split(/\r?\n/)
        .find((l) => NODE_ERROR_RE.test(l)) ?? nodeErr[0];
      snippet = line.trim();
    }
  }

  // ── 8. Uncaught exceptions ───────────────────────────────────────────────
  if (!type) {
    const uncaught = text.match(UNCAUGHT_RE);
    if (uncaught) {
      type = "runtime_error";
      const line = text
        .split(/\r?\n/)
        .find((l) => UNCAUGHT_RE.test(l)) ?? uncaught[0];
      snippet = line.trim();
    }
  }

  // ── 9. Stack trace (without explicit error type) ─────────────────────────
  if (!type) {
    const stack = text.match(STACK_TRACE_RE);
    if (stack) {
      // Only fire if there's also some indication of failure nearby
      const lower = text.toLowerCase();
      if (lower.includes("error") || lower.includes("fail") || lower.includes("exception")) {
        type = "runtime_error";
        // Use the first non-"at" line as the snippet
        const firstMeaningfulLine = text
          .split(/\r?\n/)
          .find((l) => l.trim() && !/^\s+at\s/.test(l));
        snippet = (firstMeaningfulLine ?? stack[0]).trim();
      }
    }
  }

  // ── 10. npm ERR! ─────────────────────────────────────────────────────────
  if (!type) {
    const npmErr = text.match(NPM_ERR_RE);
    if (npmErr) {
      type = "build_error";
      const line = text
        .split(/\r?\n/)
        .find((l) => NPM_ERR_RE.test(l)) ?? npmErr[0];
      snippet = line.trim();
    }
  }

  // ── 11. Build success ────────────────────────────────────────────────────
  if (!type) {
    const success = text.match(BUILD_SUCCESS_RE);
    if (success) {
      type = "build_success";
      snippet = success[0].trim();
    }
  }

  // ── 12. Test pass (Jest) ─────────────────────────────────────────────────
  if (!type) {
    const jestPass = text.match(JEST_PASS_RE);
    if (jestPass) {
      type = "test_pass";
      snippet = jestPass[0].trim();
    }
  }

  // ── 13. All tests pass ───────────────────────────────────────────────────
  if (!type) {
    const allPass = text.match(ALL_PASS_RE);
    if (allPass) {
      type = "test_pass";
      snippet = allPass[0].trim();
    }
  }

  // ── 14. Mocha / Mocha-compatible pass ────────────────────────────────────
  if (!type) {
    const passMatch = text.match(PASS_RE);
    if (passMatch) {
      type = "test_pass";
      snippet = passMatch[0].trim();
    }
  }

  // ── 15. Node test runner pass (ok N -) ───────────────────────────────────
  if (!type) {
    const nodePass = text.match(NODE_TEST_PASS_RE);
    if (nodePass) {
      // Only fire test_pass if there's also a summary count line, not just any "ok" line
      const lower = text.toLowerCase();
      if (lower.includes("passing") || lower.includes("passed") || lower.includes("tests run")) {
        type = "test_pass";
        snippet = nodePass[0].trim();
      }
    }
  }

  if (!type) return [];

  const event = buildTerminalEvent(type, snippet, source, timestamp);

  // Deduplicate
  if (isDuplicateTerminalEvent(event, existingEvents, dedupeWindowMs)) {
    return [];
  }

  return [event];
}

// ---------------------------------------------------------------------------
// Utility: classify terminal app names
// ---------------------------------------------------------------------------

const TERMINAL_APP_NAMES = new Set([
  "terminal",
  "iterm",
  "iterm2",
  "ghostty",
  "warp",
  "kitty",
  "alacritty",
  "hyper",
  "rio",
  "wezterm",
]);

/**
 * Returns true if the given app name is a known terminal application.
 */
export function isTerminalApp(appName: string): boolean {
  return TERMINAL_APP_NAMES.has(appName.toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// Utility: loop detection from terminal events
// ---------------------------------------------------------------------------

/**
 * Returns true if the same error fingerprint has appeared 3 or more times
 * within the last 20 minutes. More precise than the screen-based loop detector
 * because it's based on actual error text, not keyword overlap.
 */
export function detectTerminalLoop(
  events: TerminalEvent[],
  windowMs = 20 * 60_000,
): boolean {
  const now = Date.now();
  const recent = events.filter(
    (e) =>
      (e.type === "build_error" || e.type === "test_failure" || e.type === "runtime_error") &&
      now - e.timestamp <= windowMs,
  );
  if (recent.length < 3) return false;

  // Count fingerprints
  const counts = new Map<string, number>();
  for (const e of recent) {
    const fp = terminalEventFingerprint(e);
    counts.set(fp, (counts.get(fp) ?? 0) + 1);
  }
  return Array.from(counts.values()).some((c) => c >= 3);
}

// ---------------------------------------------------------------------------
// File reference extraction from build error output
// ---------------------------------------------------------------------------

/**
 * Matches file references with optional line:col, covering common build tool formats:
 *   TypeScript: src/foo.ts(42,5)  or  src/foo.ts:42:5
 *   Rust/Go:    src/main.rs:42:5
 *   ESLint:     src/foo.js:42:5
 * Only matches paths ending in a known source extension.
 */
const FILE_REF_RE =
  /(?:^|[\s(])([./\w-][\w./\-]*\.(?:tsx|ts|jsx|js|mts|cts|mjs|cjs|rs|go|py|cpp|hpp|c|h|java|swift|kt|rb))(?:[:(](\d+))?/gm;

/**
 * Extract unique file paths referenced in build error output.
 * Returns up to 5 distinct paths (most likely to be relevant).
 * Pure — no fs access, safe to call in any environment.
 */
export function extractErrorFileRefs(text: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  let m: RegExpExecArray | null;
  FILE_REF_RE.lastIndex = 0;
  while ((m = FILE_REF_RE.exec(text)) !== null) {
    const p = m[1];
    if (!seen.has(p)) {
      seen.add(p);
      results.push(p);
      if (results.length >= 5) break;
    }
  }
  return results;
}
