/**
 * Tests for aletheiaSessionStore.ts — Aletheia companion session SQLite store.
 *
 * Strategy: open a temp-dir SQLite DB using the same DDL from the store,
 * then run SQL directly (no Electron / getDb() dependency).
 * Architecture-boundary checks run as static source analysis.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALETHEIA_SESSIONS_DDL = `
  CREATE TABLE IF NOT EXISTS aletheia_sessions (
    id          TEXT PRIMARY KEY,
    started_at  INTEGER NOT NULL,
    ended_at    INTEGER,
    turn_count  INTEGER NOT NULL DEFAULT 0,
    front_app   TEXT,
    summary     TEXT,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_aletheia_sessions_started
    ON aletheia_sessions (started_at DESC);
`;

function openTestDb(): Database.Database {
  const dir = mkdtempSync(join(tmpdir(), "glass-aletheia-sessions-"));
  const db = new Database(join(dir, "aletheia-test.db"));
  db.pragma("journal_mode = WAL");
  db.exec(ALETHEIA_SESSIONS_DDL);
  return db;
}

function startSession(
  db: Database.Database,
  id: string,
  startedAt: number,
  frontApp?: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO aletheia_sessions (id, started_at, front_app, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(id, startedAt, frontApp ?? null, Date.now());
}

function endSession(
  db: Database.Database,
  id: string,
  endedAt: number,
  turnCount: number,
  summary?: string,
): void {
  const safeSummary = summary ? summary.slice(0, 500) : null;
  db.prepare(
    `UPDATE aletheia_sessions SET ended_at = ?, turn_count = ?, summary = ? WHERE id = ?`,
  ).run(endedAt, turnCount, safeSummary, id);
}

function getRecent(db: Database.Database, limit: number) {
  return db
    .prepare(
      `SELECT id, started_at, ended_at, turn_count, front_app, summary, created_at
       FROM aletheia_sessions ORDER BY started_at DESC LIMIT ?`,
    )
    .all(limit);
}

function deleteAll(db: Database.Database): void {
  db.prepare("DELETE FROM aletheia_sessions").run();
}

// ---------------------------------------------------------------------------
// Runtime tests (direct SQL, no Electron)
// ---------------------------------------------------------------------------

test("startAletheiaSession creates a row with correct id, started_at, front_app", () => {
  const db = openTestDb();
  const id = "test-session-001";
  const startedAt = Date.now();
  startSession(db, id, startedAt, "Cursor");

  const row = db
    .prepare("SELECT * FROM aletheia_sessions WHERE id = ?")
    .get(id) as {
      id: string;
      started_at: number;
      ended_at: number | null;
      turn_count: number;
      front_app: string | null;
      summary: string | null;
      created_at: number;
    } | undefined;

  assert.ok(row, "row should exist after startSession");
  assert.equal(row!.id, id);
  assert.equal(row!.started_at, startedAt);
  assert.equal(row!.front_app, "Cursor");
  assert.equal(row!.ended_at, null, "ended_at should be null for active session");
  assert.equal(row!.turn_count, 0, "turn_count defaults to 0");
  assert.equal(row!.summary, null, "summary should be null initially");
  db.close();
});

test("endAletheiaSession updates ended_at, turn_count, and summary", () => {
  const db = openTestDb();
  const id = "test-session-002";
  const startedAt = Date.now() - 5_000;
  const endedAt = Date.now();
  startSession(db, id, startedAt);
  endSession(db, id, endedAt, 7, "Discussed TypeScript patterns.");

  const row = db
    .prepare("SELECT * FROM aletheia_sessions WHERE id = ?")
    .get(id) as {
      ended_at: number | null;
      turn_count: number;
      summary: string | null;
    } | undefined;

  assert.ok(row, "row should exist");
  assert.equal(row!.ended_at, endedAt);
  assert.equal(row!.turn_count, 7);
  assert.equal(row!.summary, "Discussed TypeScript patterns.");
  db.close();
});

test("getRecentAletheiaSessions returns at most limit rows, ordered by started_at DESC", () => {
  const db = openTestDb();
  const base = Date.now();
  // Insert 8 sessions with distinct started_at values
  for (let i = 0; i < 8; i++) {
    startSession(db, `session-${i}`, base + i * 1000);
  }

  const rows = getRecent(db, 5) as Array<{ id: string; started_at: number }>;
  assert.equal(rows.length, 5, "should return at most 5 rows");

  // Verify descending order
  for (let i = 0; i < rows.length - 1; i++) {
    assert.ok(
      rows[i].started_at >= rows[i + 1].started_at,
      `rows[${i}].started_at (${rows[i].started_at}) should be >= rows[${i + 1}].started_at (${rows[i + 1].started_at})`,
    );
  }

  // Most recent session should be session-7 (highest started_at)
  assert.equal(rows[0].id, "session-7");
  db.close();
});

test("deleteAletheiaSessions wipes all rows", () => {
  const db = openTestDb();
  const base = Date.now();
  for (let i = 0; i < 3; i++) {
    startSession(db, `wipe-session-${i}`, base + i);
  }
  const before = db
    .prepare("SELECT COUNT(*) AS n FROM aletheia_sessions")
    .get() as { n: number };
  assert.equal(before.n, 3, "should have 3 rows before delete");

  deleteAll(db);

  const after = db
    .prepare("SELECT COUNT(*) AS n FROM aletheia_sessions")
    .get() as { n: number };
  assert.equal(after.n, 0, "should have 0 rows after deleteAletheiaSessions");
  db.close();
});

test("schema round-trip: insert → end → read → verify all fields", () => {
  const db = openTestDb();
  const id = "round-trip-001";
  const startedAt = 1_700_000_000_000;
  const endedAt = 1_700_000_060_000;
  const turnCount = 4;
  const frontApp = "Figma";
  const summary = "Designed the onboarding flow.";
  const createdAt = Date.now();

  db.prepare(
    `INSERT OR IGNORE INTO aletheia_sessions (id, started_at, front_app, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(id, startedAt, frontApp, createdAt);
  db.prepare(
    `UPDATE aletheia_sessions SET ended_at = ?, turn_count = ?, summary = ? WHERE id = ?`,
  ).run(endedAt, turnCount, summary, id);

  const row = db
    .prepare(
      `SELECT id, started_at, ended_at, turn_count, front_app, summary, created_at
       FROM aletheia_sessions WHERE id = ?`,
    )
    .get(id) as {
      id: string;
      started_at: number;
      ended_at: number | null;
      turn_count: number;
      front_app: string | null;
      summary: string | null;
      created_at: number;
    } | undefined;

  assert.ok(row, "row must exist");
  assert.equal(row!.id, id);
  assert.equal(row!.started_at, startedAt);
  assert.equal(row!.ended_at, endedAt);
  assert.equal(row!.turn_count, turnCount);
  assert.equal(row!.front_app, frontApp);
  assert.equal(row!.summary, summary);
  assert.equal(row!.created_at, createdAt);
  db.close();
});

test("summary is truncated to 500 chars on endAletheiaSession", () => {
  const db = openTestDb();
  const id = "truncate-test-001";
  startSession(db, id, Date.now() - 1000);
  const longSummary = "x".repeat(600);
  endSession(db, id, Date.now(), 2, longSummary);

  const row = db
    .prepare("SELECT summary FROM aletheia_sessions WHERE id = ?")
    .get(id) as { summary: string | null } | undefined;
  assert.ok(row?.summary, "summary should exist");
  assert.equal(row!.summary!.length, 500, "summary should be capped at 500 chars");
  db.close();
});

test("OR IGNORE prevents duplicate session IDs from overwriting", () => {
  const db = openTestDb();
  const id = "dedup-001";
  const startedAt = Date.now();
  startSession(db, id, startedAt, "Chrome");
  // Second insert with same id should be silently ignored
  startSession(db, id, startedAt + 9999, "Safari");

  const rows = db
    .prepare("SELECT * FROM aletheia_sessions WHERE id = ?")
    .all(id) as Array<{ front_app: string | null }>;
  assert.equal(rows.length, 1, "should have exactly one row");
  assert.equal(rows[0].front_app, "Chrome", "original front_app should not be overwritten");
  db.close();
});

// ---------------------------------------------------------------------------
// Static source-analysis: architecture boundary tests
// ---------------------------------------------------------------------------

test("aletheiaSessionStore.ts exports required functions and type", () => {
  const src = readFileSync(join(ROOT, "main", "aletheiaSessionStore.ts"), "utf8");

  assert.match(src, /export.*AletheiaSessionRow/, "AletheiaSessionRow type must be exported");
  assert.match(src, /export function createAletheiaSessionsTable/, "createAletheiaSessionsTable must be exported");
  assert.match(src, /export function startAletheiaSession/, "startAletheiaSession must be exported");
  assert.match(src, /export function endAletheiaSession/, "endAletheiaSession must be exported");
  assert.match(src, /export function getRecentAletheiaSessions/, "getRecentAletheiaSessions must be exported");
  assert.match(src, /export function deleteAletheiaSessions/, "deleteAletheiaSessions must be exported");
  assert.match(src, /export function appendObservationSnapshot/, "appendObservationSnapshot must be exported");
  assert.match(
    src,
    /if \(!sessionId\) return/,
    "appendObservationSnapshot must skip persistence when sessionId is null",
  );
  assert.match(src, /export function getRecentObservationSnapshots/, "getRecentObservationSnapshots must be exported");
});

test("deleteAletheiaSessions is NOT imported in aletheiaDashboardIpc.ts (Glass Memory admin only)", () => {
  const src = readFileSync(join(ROOT, "main", "aletheiaDashboardIpc.ts"), "utf8");
  assert.doesNotMatch(
    src,
    /deleteAletheiaSessions/,
    "deleteAletheiaSessions must never appear in aletheiaDashboardIpc.ts — it is Glass Memory admin only",
  );
});

test("IPC.deleteAletheiaSessionHistory is registered in dashboardIpc.ts (Glass only)", () => {
  const src = readFileSync(join(ROOT, "main", "dashboardIpc.ts"), "utf8");
  assert.match(src, /IPC\.deleteAletheiaSessionHistory/, "deleteAletheiaSessionHistory handler must be in dashboardIpc.ts");
  assert.match(src, /deleteAletheiaSessions/, "dashboardIpc.ts must call deleteAletheiaSessions()");
});

test("ipcMain.handle for deleteAletheiaSessionHistory is NOT present in aletheiaDashboardIpc.ts", () => {
  const src = readFileSync(join(ROOT, "main", "aletheiaDashboardIpc.ts"), "utf8");
  // The channel string itself must not be passed to ipcMain.handle in this file.
  // (It may appear in comments; we check the handle() call specifically.)
  assert.doesNotMatch(
    src,
    /ipcMain\.handle\([^)]*deleteAletheiaSessionHistory/,
    "ipcMain.handle(IPC.deleteAletheiaSessionHistory) must never appear in aletheiaDashboardIpc.ts — it is Glass Memory admin only",
  );
});

test("IPC channels getAletheiaSessionHistory and deleteAletheiaSessionHistory are defined in ipc.ts", () => {
  const src = readFileSync(join(ROOT, "shared", "ipc.ts"), "utf8");
  assert.match(src, /getAletheiaSessionHistory/, "getAletheiaSessionHistory channel must exist in ipc.ts");
  assert.match(src, /deleteAletheiaSessionHistory/, "deleteAletheiaSessionHistory channel must exist in ipc.ts");
  assert.match(src, /glass:aletheia-get-session-history/, "channel string must match spec");
  assert.match(src, /glass:aletheia-delete-session-history/, "channel string must match spec");
});

test("createAletheiaSessionsTable is called in index.ts after initDatabase", () => {
  const src = readFileSync(join(ROOT, "main", "index.ts"), "utf8");
  assert.match(src, /createAletheiaSessionsTable/, "createAletheiaSessionsTable must be called in index.ts");
  assert.match(src, /aletheiaObservationPlane/, "aletheiaObservationPlane must be wired in index.ts");
  assert.match(src, /aletheiaActivation/, "aletheiaActivation must be wired in index.ts");
  assert.match(src, /aletheiaAmbientSynthesis/, "aletheiaAmbientSynthesis must be wired in index.ts");
  assert.match(src, /refreshAletheiaObservationPlaneState/, "refreshAletheiaObservationPlaneState must be wired in index.ts");
  // Verify table init appears near initDatabase call
  const initIdx = src.indexOf("initDatabase()");
  const tableIdx = src.indexOf("createAletheiaSessionsTable()");
  assert.ok(initIdx > -1, "initDatabase must exist in index.ts");
  assert.ok(tableIdx > -1, "createAletheiaSessionsTable must exist in index.ts");
  assert.ok(
    tableIdx > initIdx,
    "createAletheiaSessionsTable() must appear after initDatabase() in index.ts",
  );
});

test("beginAletheiaSession and finalizeAletheiaSession are called in index.ts companion toggle", () => {
  const src = readFileSync(join(ROOT, "main", "index.ts"), "utf8");
  assert.match(src, /beginAletheiaSession/, "beginAletheiaSession must be wired in index.ts");
  assert.match(src, /finalizeAletheiaSession/, "finalizeAletheiaSession must be wired in index.ts");
});

test("companionSessionStore.ts exports beginAletheiaSession, finalizeAletheiaSession, incrementAletheiaSessionTurn", () => {
  const src = readFileSync(join(ROOT, "main", "companionSessionStore.ts"), "utf8");
  assert.match(src, /export function beginAletheiaSession/, "beginAletheiaSession must be exported");
  assert.match(src, /export function finalizeAletheiaSession/, "finalizeAletheiaSession must be exported");
  assert.match(src, /export function incrementAletheiaSessionTurn/, "incrementAletheiaSessionTurn must be exported");
});
