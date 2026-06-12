/**
 * Unit tests — wingmanMemory.ts
 *
 * Covers:
 *   - DEFAULT_WINGMAN_MEMORY_STATE shape
 *   - buildSessionRecord (compact, no base64)
 *   - serializeSessionRecord (JSONL line, sanitizes base64)
 *   - parseSessionLibrary (roundtrip, corrupt-line recovery, empty input)
 *   - searchWingmanSessions (scoring, limit, empty query, no matches, ties)
 *   - formatSessionAge (today/yesterday/n days/month+day)
 *   - formatSessionDuration (<1 min, minutes, hours)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildSessionRecord,
  serializeSessionRecord,
  parseSessionLibrary,
  searchWingmanSessions,
  formatSessionAge,
  formatSessionDuration,
  DEFAULT_WINGMAN_MEMORY_STATE,
  type WingmanSessionRecord,
} from "../shared/wingmanMemory.ts";
import type { WingmanSession, WingmanReport } from "../shared/wingmanSession.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<WingmanSession> = {}): WingmanSession {
  const now = Date.now();
  return {
    id: "sess-001",
    goal: "fix the broken payment webhook",
    startedAt: now - 10 * 60_000,
    endedAt: now,
    appSnapshots: [],
    inspections: [],
    notes: [],
    loopWarning: false,
    terminalEvents: [],
    terminalWatching: false,
    agentCalls: [],
    ...overrides,
  };
}

function makeReport(overrides: Partial<WingmanReport> = {}): WingmanReport {
  return {
    goal: "fix the broken payment webhook",
    duration: 10 * 60_000,
    appsUsed: ["VS Code", "Terminal"],
    summary: "The webhook handler appeared to be missing error handling for 5xx responses.",
    keyFindings: ["Observed no retry logic in webhook.ts", "Appears logs truncate after 1000 chars"],
    warningsIssued: [],
    observedOnly: ["webhook.ts line 42 appears to throw silently"],
    notVerified: ["Whether the fix resolves prod errors", "Load under concurrent requests"],
    nextSteps: ["Add retry logic to webhook.ts", "Deploy to staging and verify"],
    ...overrides,
  };
}

function makeRecord(overrides: Partial<WingmanSessionRecord> = {}): WingmanSessionRecord {
  const now = Date.now();
  return {
    id: "sess-001",
    goal: "fix the broken payment webhook",
    startedAt: now - 10 * 60_000,
    endedAt: now,
    duration: 10 * 60_000,
    appsUsed: ["VS Code", "Terminal"],
    summary: "The webhook handler appeared to be missing error handling.",
    keyFindings: ["Observed no retry logic"],
    notVerified: ["Whether the fix resolves prod errors"],
    nextSteps: ["Add retry logic"],
    warningsIssued: [],
    savedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── DEFAULT_WINGMAN_MEMORY_STATE ─────────────────────────────────────────────

describe("DEFAULT_WINGMAN_MEMORY_STATE", () => {
  test("has the correct default shape", () => {
    assert.deepEqual(DEFAULT_WINGMAN_MEMORY_STATE, {
      searchResults: [],
      totalSessions: 0,
      loading: false,
    });
  });
});

// ─── buildSessionRecord ───────────────────────────────────────────────────────

describe("buildSessionRecord", () => {
  test("builds a compact record from session + report", () => {
    const session = makeSession();
    const report = makeReport();
    const record = buildSessionRecord(session, report);

    assert.equal(record.id, session.id);
    assert.equal(record.goal, session.goal);
    assert.equal(record.startedAt, session.startedAt);
    assert.equal(record.endedAt, session.endedAt);
    assert.equal(record.duration, (session.endedAt as number) - session.startedAt);
    assert.deepEqual(record.appsUsed, ["VS Code", "Terminal"]);
    assert.equal(record.summary, report.summary);
    assert.deepEqual(record.keyFindings, report.keyFindings.slice(0, 4));
    assert.deepEqual(record.notVerified, report.notVerified.slice(0, 3));
    assert.deepEqual(record.nextSteps, report.nextSteps.slice(0, 3));
    assert.deepEqual(record.warningsIssued, []);
    assert.equal(typeof record.savedAt, "string");
  });

  test("uses Date.now() as endedAt when session.endedAt is undefined", () => {
    const session = makeSession({ endedAt: undefined });
    const report = makeReport();
    const before = Date.now();
    const record = buildSessionRecord(session, report);
    const after = Date.now();

    assert.ok(record.endedAt >= before, "endedAt should be >= before");
    assert.ok(record.endedAt <= after, "endedAt should be <= after");
  });

  test("caps keyFindings at 4 entries", () => {
    const report = makeReport({ keyFindings: ["f1", "f2", "f3", "f4", "f5", "f6"] });
    const record = buildSessionRecord(makeSession(), report);
    assert.equal(record.keyFindings.length, 4);
  });

  test("caps notVerified at 3 entries", () => {
    const report = makeReport({ notVerified: ["n1", "n2", "n3", "n4"] });
    const record = buildSessionRecord(makeSession(), report);
    assert.equal(record.notVerified.length, 3);
  });

  test("caps nextSteps at 3 entries", () => {
    const report = makeReport({ nextSteps: ["s1", "s2", "s3", "s4"] });
    const record = buildSessionRecord(makeSession(), report);
    assert.equal(record.nextSteps.length, 3);
  });
});

// ─── serializeSessionRecord ───────────────────────────────────────────────────

describe("serializeSessionRecord", () => {
  test("returns valid JSON string", () => {
    const record = makeRecord();
    const line = serializeSessionRecord(record);
    assert.doesNotThrow(() => JSON.parse(line));
  });

  test("does not include a newline character", () => {
    const record = makeRecord();
    const line = serializeSessionRecord(record);
    assert.ok(!line.includes("\n"), "line should not contain newlines");
  });

  test("strips base64 data from summary", () => {
    const record = makeRecord({
      summary: "screenshot: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA and something",
    });
    const line = serializeSessionRecord(record);
    const parsed = JSON.parse(line) as WingmanSessionRecord;
    assert.ok(!parsed.summary.includes("base64"), "summary should not contain base64");
    assert.ok(parsed.summary.includes("[image removed]"), "should contain replacement marker");
  });

  test("strips base64 from keyFindings", () => {
    const record = makeRecord({
      keyFindings: ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAA== found in logs"],
    });
    const line = serializeSessionRecord(record);
    const parsed = JSON.parse(line) as WingmanSessionRecord;
    assert.ok(!parsed.keyFindings[0].includes("base64"), "finding should not contain base64");
  });

  test("round-trips cleanly through parseSessionLibrary", () => {
    const record = makeRecord();
    const line = serializeSessionRecord(record);
    const parsed = parseSessionLibrary(line);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].id, record.id);
    assert.equal(parsed[0].goal, record.goal);
  });
});

// ─── parseSessionLibrary ──────────────────────────────────────────────────────

describe("parseSessionLibrary", () => {
  test("returns empty array for empty string", () => {
    assert.equal(parseSessionLibrary("").length, 0);
  });

  test("returns empty array for whitespace-only string", () => {
    assert.equal(parseSessionLibrary("   \n\n  ").length, 0);
  });

  test("parses a single valid JSONL line", () => {
    const record = makeRecord();
    const line = serializeSessionRecord(record);
    const result = parseSessionLibrary(line);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, record.id);
  });

  test("parses multiple JSONL lines", () => {
    const r1 = makeRecord({ id: "a" });
    const r2 = makeRecord({ id: "b" });
    const content = [serializeSessionRecord(r1), serializeSessionRecord(r2)].join("\n");
    const result = parseSessionLibrary(content);
    assert.equal(result.length, 2);
    const ids = result.map((r) => r.id);
    assert.ok(ids.includes("a"));
    assert.ok(ids.includes("b"));
  });

  test("skips corrupt (non-JSON) lines and recovers remaining", () => {
    const r1 = makeRecord({ id: "good-1" });
    const r2 = makeRecord({ id: "good-2" });
    const content = [
      serializeSessionRecord(r1),
      "this is not json }{",
      serializeSessionRecord(r2),
    ].join("\n");
    const result = parseSessionLibrary(content);
    assert.equal(result.length, 2);
    const ids = result.map((r) => r.id);
    assert.ok(ids.includes("good-1"));
    assert.ok(ids.includes("good-2"));
  });

  test("skips JSON objects missing required fields", () => {
    const valid = makeRecord({ id: "ok" });
    const invalid = JSON.stringify({ foo: "bar" });
    const content = [serializeSessionRecord(valid), invalid].join("\n");
    const result = parseSessionLibrary(content);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "ok");
  });

  test("handles trailing newline gracefully", () => {
    const record = makeRecord();
    const content = serializeSessionRecord(record) + "\n";
    const result = parseSessionLibrary(content);
    assert.equal(result.length, 1);
  });
});

// ─── searchWingmanSessions ────────────────────────────────────────────────────

describe("searchWingmanSessions", () => {
  const now = Date.now();

  const sessions: WingmanSessionRecord[] = [
    makeRecord({
      id: "s1",
      goal: "debug the broken payment webhook",
      summary: "Observed multiple 500 errors in the webhook handler",
      keyFindings: ["Error thrown silently in webhook.ts"],
      endedAt: now - 5 * 60_000,  // 5 min ago
    }),
    makeRecord({
      id: "s2",
      goal: "refactor the auth module",
      summary: "Appeared to be duplicated logic across auth files",
      keyFindings: ["Duplicate JWT validation found"],
      endedAt: now - 2 * 60_000,  // 2 min ago — newer
    }),
    makeRecord({
      id: "s3",
      goal: "investigate memory leak in node process",
      summary: "Heap dump showed 400MB retained",
      keyFindings: ["Large array not garbage collected"],
      endedAt: now - 10 * 60_000, // 10 min ago — oldest
    }),
  ];

  test("returns empty array when sessions list is empty", () => {
    const result = searchWingmanSessions("payment", []);
    assert.equal(result.length, 0);
  });

  test("returns most recent sessions for empty query", () => {
    const result = searchWingmanSessions("", sessions, 2);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, "s2"); // newest first
    assert.equal(result[1].id, "s1");
  });

  test("returns most recent sessions for whitespace-only query", () => {
    const result = searchWingmanSessions("   ", sessions, 2);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, "s2");
  });

  test("finds session by goal keyword", () => {
    const result = searchWingmanSessions("payment", sessions);
    assert.ok(result.length > 0);
    assert.equal(result[0].id, "s1"); // goal hit = 3 pts
  });

  test("finds session by summary keyword", () => {
    const result = searchWingmanSessions("heap", sessions);
    assert.ok(result.length > 0);
    assert.equal(result[0].id, "s3");
  });

  test("finds session by keyFindings keyword", () => {
    const result = searchWingmanSessions("jwt", sessions);
    assert.ok(result.length > 0);
    assert.equal(result[0].id, "s2");
  });

  test("returns empty array when no keyword matches", () => {
    const result = searchWingmanSessions("zzznonexistent", sessions);
    assert.equal(result.length, 0);
  });

  test("respects the limit parameter", () => {
    const result = searchWingmanSessions("", sessions, 2);
    assert.equal(result.length, 2);
  });

  test("returns all sessions up to 5 when query is empty", () => {
    const result = searchWingmanSessions("", sessions);
    assert.equal(result.length, 3); // only 3 sessions, all ≤ 5
  });

  test("sorts ties by newest endedAt first", () => {
    // Both records have the keyword only in summary (2 pts each) — exact tie
    const tiedSessions: WingmanSessionRecord[] = [
      makeRecord({
        id: "tie-old",
        goal: "unrelated task alpha",
        summary: "observed error spike",
        keyFindings: [],
        endedAt: now - 10 * 60_000, // older
      }),
      makeRecord({
        id: "tie-new",
        goal: "unrelated task beta",
        summary: "observed error count",
        keyFindings: [],
        endedAt: now - 2 * 60_000,  // newer
      }),
    ];
    const result = searchWingmanSessions("error", tiedSessions);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, "tie-new", "newer session should come first on score ties");
    assert.equal(result[1].id, "tie-old");
  });

  test("goal hits outscore summary hits", () => {
    const custom: WingmanSessionRecord[] = [
      makeRecord({
        id: "goal-hit",
        goal: "debug webhook logic",
        summary: "nothing",
        keyFindings: [],
        endedAt: now - 1000,
      }),
      makeRecord({
        id: "summary-hit",
        goal: "unrelated task",
        summary: "observed webhook errors",
        keyFindings: [],
        endedAt: now,
      }),
    ];
    const result = searchWingmanSessions("webhook", custom);
    assert.equal(result[0].id, "goal-hit");
  });

  test("single-char keyword falls through to recent-sessions mode", () => {
    // "a" is too short — gets filtered out, so all keywords empty → recent mode
    const result = searchWingmanSessions("a", sessions);
    // Falls to recent-sessions default (same as empty query)
    assert.ok(result.length > 0, "should return recent sessions when all tokens too short");
    // Most recent is s2
    assert.equal(result[0].id, "s2");
  });
});

// ─── formatSessionAge ────────────────────────────────────────────────────────

describe("formatSessionAge", () => {
  const DAY = 86_400_000;

  test("returns 'Today' for sessions ended < 1 day ago", () => {
    const record = makeRecord({ endedAt: Date.now() - 30 * 60_000 });
    assert.equal(formatSessionAge(record), "Today");
  });

  test("returns 'Yesterday' for sessions ended ~1 day ago", () => {
    const record = makeRecord({ endedAt: Date.now() - DAY - 60_000 });
    assert.equal(formatSessionAge(record), "Yesterday");
  });

  test("returns 'N days ago' for sessions 2-6 days ago", () => {
    const record = makeRecord({ endedAt: Date.now() - 3 * DAY - 60_000 });
    assert.equal(formatSessionAge(record), "3 days ago");
  });

  test("returns 'Month Day' for sessions 7+ days ago", () => {
    const fixed = new Date("2026-01-05T12:00:00Z").getTime();
    const record = makeRecord({ endedAt: fixed });
    const label = formatSessionAge(record, fixed + 10 * DAY);
    assert.match(label, /Jan\s*5/);
  });
});

// ─── formatSessionDuration ───────────────────────────────────────────────────

describe("formatSessionDuration", () => {
  test("returns '< 1 min' for 0 ms", () => {
    assert.equal(formatSessionDuration(0), "< 1 min");
  });

  test("returns '< 1 min' for 30 seconds", () => {
    assert.equal(formatSessionDuration(30_000), "< 1 min");
  });

  test("returns '1 min' for exactly 60 seconds", () => {
    assert.equal(formatSessionDuration(60_000), "1 min");
  });

  test("returns 'N min' for < 1 hour", () => {
    assert.equal(formatSessionDuration(17 * 60_000), "17 min");
  });

  test("returns 'N hr' for exact hours", () => {
    assert.equal(formatSessionDuration(2 * 60 * 60_000), "2 hr");
  });

  test("returns 'N hr M min' for hours + minutes", () => {
    assert.equal(formatSessionDuration((1 * 60 + 23) * 60_000), "1 hr 23 min");
  });

  test("rounds to nearest minute", () => {
    assert.equal(formatSessionDuration(4 * 60_000 + 29_000), "4 min");
    assert.equal(formatSessionDuration(4 * 60_000 + 31_000), "5 min");
  });
});
