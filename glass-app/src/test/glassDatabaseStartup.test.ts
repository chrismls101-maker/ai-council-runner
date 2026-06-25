import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import {
  detectUncleanShutdown,
  markSessionClosed,
  markSessionOpen,
  parseIntegrityCheckResult,
  quarantineCorruptedDatabaseFiles,
  runIntegrityCheckOnFile,
} from "../main/glassDatabaseStartup.ts";

// Minimal migration runner for tests (mirrors production schema through V6).
function applyMigrationsForTest(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
  `);
  const row = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get() as
    | { version: number }
    | undefined;
  if ((row?.version ?? 0) >= 6) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_session_tombstone (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      status TEXT NOT NULL,
      opened_at INTEGER NOT NULL,
      closed_at INTEGER
    );
    INSERT OR IGNORE INTO app_session_tombstone (singleton, status, opened_at, closed_at)
    VALUES (1, 'session_closed', 0, 0);
  `);
  db.prepare("INSERT OR REPLACE INTO schema_version (version) VALUES (6)").run();
}

test("parseIntegrityCheckResult accepts ok", () => {
  assert.equal(parseIntegrityCheckResult([{ integrity_check: "ok" }]).ok, true);
  assert.equal(parseIntegrityCheckResult("ok").ok, true);
});

test("parseIntegrityCheckResult rejects corruption detail", () => {
  const parsed = parseIntegrityCheckResult([{ integrity_check: "*** malformed ***" }]);
  assert.equal(parsed.ok, false);
  assert.match(parsed.detail, /malformed/);
});

test("runIntegrityCheckOnFile fails on garbage bytes", () => {
  const dir = mkdtempSync(join(tmpdir(), "glass-db-"));
  const path = join(dir, "session-history.db");
  writeFileSync(path, "not-a-sqlite-database");
  const result = runIntegrityCheckOnFile(path);
  assert.equal(result.ok, false);
});

test("quarantineCorruptedDatabaseFiles renames db and wal sidecars", () => {
  const dir = mkdtempSync(join(tmpdir(), "glass-db-"));
  const path = join(dir, "session-history.db");
  writeFileSync(path, "corrupt");
  writeFileSync(`${path}-wal`, "wal");
  const backup = quarantineCorruptedDatabaseFiles(path);
  assert.ok(backup.includes("glass-corrupted-"));
  assert.equal(existsSync(path), false);
  assert.equal(existsSync(backup), true);
  assert.equal(existsSync(`${backup}-wal`), true);
});

test("session tombstone detects unclean shutdown", () => {
  const dir = mkdtempSync(join(tmpdir(), "glass-db-"));
  const path = join(dir, "session-history.db");
  const db = new Database(path);
  applyMigrationsForTest(db);
  assert.equal(detectUncleanShutdown(db), false);
  markSessionOpen(db);
  assert.equal(detectUncleanShutdown(db), true);
  markSessionClosed(db);
  assert.equal(detectUncleanShutdown(db), false);
  db.close();
});
