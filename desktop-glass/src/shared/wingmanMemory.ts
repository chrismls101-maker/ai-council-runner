/**
 * IIVO Glass — Wingman cross-session memory.
 *
 * Stores completed Wingman sessions as a local JSONL library so Wingman can
 * reference past work: "You worked on something similar 3 days ago."
 *
 * Storage format: one JSON line per completed session in:
 *   <userData>/wingman-sessions.jsonl
 *
 * Privacy contract:
 *   - Never stores raw screenshots, base64 image data, or audio
 *   - Stores only text: goal, summary, findings, apps used
 *   - Library lives entirely on-device — never sent to any server
 *   - User can delete the file to clear all memory
 *
 * Pure logic only — no fs/electron imports so it stays unit-testable.
 */

import type { WingmanSession, WingmanReport } from "./wingmanSession.ts";

// ---------------------------------------------------------------------------
// Storage type
// ---------------------------------------------------------------------------

/**
 * Compact, storable representation of a completed Wingman session.
 * Subset of WingmanReport + session metadata — no screenshots or base64.
 */
export interface WingmanSessionRecord {
  /** Unique session id from the original WingmanSession. */
  id: string;
  /** The user's original task goal. */
  goal: string;
  /** Unix timestamp (ms) when the session started. */
  startedAt: number;
  /** Unix timestamp (ms) when the session ended. */
  endedAt: number;
  /** Duration in milliseconds. */
  duration: number;
  /** Unique app names seen during the session. */
  appsUsed: string[];
  /** AI-generated narrative summary. */
  summary: string;
  /** Key findings from inspections (observed language). Up to 4. */
  keyFindings: string[];
  /** Things that still needed manual verification. Up to 3. */
  notVerified: string[];
  /** Concrete next steps from the report. Up to 3. */
  nextSteps: string[];
  /** Warnings issued during the session (loop, scope drift). */
  warningsIssued: string[];
  /** ISO date string when this record was saved. */
  savedAt: string;
}

// ---------------------------------------------------------------------------
// State type (broadcast via IPC)
// ---------------------------------------------------------------------------

export interface WingmanMemoryState {
  /** Records matching the last search query, newest first, max 5. */
  searchResults: WingmanSessionRecord[];
  /** Total number of records in the library. */
  totalSessions: number;
  /** True while a search or save is in progress. */
  loading: boolean;
}

export const DEFAULT_WINGMAN_MEMORY_STATE: WingmanMemoryState = {
  searchResults: [],
  totalSessions: 0,
  loading: false,
};

// ---------------------------------------------------------------------------
// Record builder
// ---------------------------------------------------------------------------

/**
 * Build a storable WingmanSessionRecord from a completed session + its report.
 * Strips all screenshot refs and base64 data.
 */
export function buildSessionRecord(
  session: WingmanSession,
  report: WingmanReport,
): WingmanSessionRecord {
  const endedAt = session.endedAt ?? Date.now();
  return {
    id: session.id,
    goal: session.goal,
    startedAt: session.startedAt,
    endedAt,
    duration: endedAt - session.startedAt,
    appsUsed: report.appsUsed.slice(),
    summary: report.summary,
    keyFindings: report.keyFindings.slice(0, 4),
    notVerified: report.notVerified.slice(0, 3),
    nextSteps: report.nextSteps.slice(0, 3),
    warningsIssued: report.warningsIssued.slice(),
    savedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// JSONL serialization
// ---------------------------------------------------------------------------

/**
 * Serialize a single session record to a JSONL line (no newline included).
 */
export function serializeSessionRecord(record: WingmanSessionRecord): string {
  // Safety: strip any accidental base64 from summary/findings before writing
  const safe = sanitizeRecord(record);
  return JSON.stringify(safe);
}

/**
 * Parse a full JSONL library string into an array of session records.
 * Corrupt or unrecognized lines are skipped silently.
 */
export function parseSessionLibrary(content: string): WingmanSessionRecord[] {
  const records: WingmanSessionRecord[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (isValidSessionRecord(parsed)) {
        records.push(parsed as WingmanSessionRecord);
      }
    } catch {
      // Skip corrupt lines — partial crash recovery
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Runtime guard — ensures a parsed object has the minimum required fields.
 * Does not enforce all fields strictly; forwards-compatible with future additions.
 */
function isValidSessionRecord(obj: unknown): obj is WingmanSessionRecord {
  if (!obj || typeof obj !== "object") return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.goal === "string" &&
    typeof r.startedAt === "number" &&
    typeof r.endedAt === "number" &&
    typeof r.duration === "number" &&
    typeof r.summary === "string" &&
    Array.isArray(r.keyFindings) &&
    Array.isArray(r.notVerified) &&
    Array.isArray(r.nextSteps)
  );
}

// ---------------------------------------------------------------------------
// Safety: strip base64 / screenshot data
// ---------------------------------------------------------------------------

const BASE64_PATTERN = /data:[a-z/]+;base64,[A-Za-z0-9+/=]{20,}/g;

function stripBase64(text: string): string {
  return text.replace(BASE64_PATTERN, "[image removed]");
}

function sanitizeRecord(record: WingmanSessionRecord): WingmanSessionRecord {
  return {
    ...record,
    summary: stripBase64(record.summary),
    keyFindings: record.keyFindings.map(stripBase64),
    notVerified: record.notVerified.map(stripBase64),
    nextSteps: record.nextSteps.map(stripBase64),
    warningsIssued: record.warningsIssued.map(stripBase64),
  };
}

export function recordContainsBase64(record: WingmanSessionRecord): boolean {
  const texts = [
    record.summary,
    ...record.keyFindings,
    ...record.notVerified,
    ...record.nextSteps,
  ];
  return texts.some((t) => BASE64_PATTERN.test(t));
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Simple keyword search over a session library.
 *
 * Scoring:
 *   - 3 pts per keyword hit in goal
 *   - 2 pts per keyword hit in summary
 *   - 1 pt per keyword hit in keyFindings
 *
 * Returns the top `limit` records (default 5), sorted by score desc then
 * endedAt desc (newest first on ties). Returns all records when query is empty.
 */
export function searchWingmanSessions(
  query: string,
  sessions: WingmanSessionRecord[],
  limit = 5,
): WingmanSessionRecord[] {
  if (sessions.length === 0) return [];

  const trimmed = query.trim();

  // Empty query → return most recent sessions
  if (!trimmed) {
    return sessions
      .slice()
      .sort((a, b) => b.endedAt - a.endedAt)
      .slice(0, limit);
  }

  // Tokenise query
  const keywords = trimmed
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  if (keywords.length === 0) {
    return sessions
      .slice()
      .sort((a, b) => b.endedAt - a.endedAt)
      .slice(0, limit);
  }

  // Score each record
  const scored = sessions.map((record) => {
    let score = 0;
    const goalLower = record.goal.toLowerCase();
    const summaryLower = record.summary.toLowerCase();
    const findingsLower = record.keyFindings.join(" ").toLowerCase();

    for (const kw of keywords) {
      if (goalLower.includes(kw)) score += 3;
      if (summaryLower.includes(kw)) score += 2;
      if (findingsLower.includes(kw)) score += 1;
    }

    return { record, score };
  });

  // Sort: score desc, then newest first on ties
  scored.sort((a, b) =>
    b.score !== a.score
      ? b.score - a.score
      : b.record.endedAt - a.record.endedAt,
  );

  return scored
    .filter(({ score }) => score > 0)
    .slice(0, limit)
    .map(({ record }) => record);
}

// ---------------------------------------------------------------------------
// Date formatting (pure — no locale dependency)
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable relative label for a session record.
 * e.g. "Today", "Yesterday", "3 days ago", "Jun 5"
 */
export function formatSessionAge(record: WingmanSessionRecord, now = Date.now()): string {
  const diffMs = now - record.endedAt;
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  const d = new Date(record.endedAt);
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${month} ${d.getDate()}`;
}

/**
 * Format duration in ms to a human label. e.g. "4 min", "1 hr 12 min"
 */
export function formatSessionDuration(ms: number): string {
  if (ms < 60_000) return "< 1 min";
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`;
}
