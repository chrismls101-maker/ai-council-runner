/**
 * Session-history DB startup helpers (integrity, tombstone, WAL checkpoint).
 * Electron-free so node:test can import without mocking desktop runtime.
 */

import Database from "better-sqlite3";
import { existsSync, renameSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export type SessionTombstoneStatus = "session_open" | "session_closed";

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?")
    .get(name) as { name: string } | undefined;
  return row != null;
}

function readSessionTombstone(db: Database.Database): SessionTombstoneStatus {
  const row = db
    .prepare("SELECT status FROM app_session_tombstone WHERE singleton = 1")
    .get() as { status: string } | undefined;
  return row?.status === "session_open" ? "session_open" : "session_closed";
}

export function parseIntegrityCheckResult(
  rows: Array<{ integrity_check?: string }> | string,
): { ok: boolean; detail: string } {
  const detail =
    typeof rows === "string"
      ? rows.trim()
      : String(rows[0]?.integrity_check ?? "unknown").trim();
  return { ok: detail.toLowerCase() === "ok", detail };
}

export function runIntegrityCheckOnFile(filePath: string): { ok: boolean; detail: string } {
  if (!existsSync(filePath)) return { ok: true, detail: "ok" };
  let probe: Database.Database | null = null;
  try {
    probe = new Database(filePath, { readonly: true });
    const rows = probe.pragma("integrity_check") as Array<{ integrity_check: string }>;
    return parseIntegrityCheckResult(rows);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, detail };
  } finally {
    try {
      probe?.close();
    } catch {
      /* ignore */
    }
  }
}

export function quarantineCorruptedDatabaseFiles(filePath: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(dirname(filePath), `glass-corrupted-${stamp}.db`);
  renameSync(filePath, backupPath);
  for (const suffix of ["-wal", "-shm"] as const) {
    const sidecar = `${filePath}${suffix}`;
    if (existsSync(sidecar)) {
      renameSync(sidecar, `${backupPath}${suffix}`);
    }
  }
  console.warn(`[glassDatabase] quarantined corrupt database → ${basename(backupPath)}`);
  return backupPath;
}

export function detectUncleanShutdown(db: Database.Database): boolean {
  if (!tableExists(db, "app_session_tombstone")) return false;
  return readSessionTombstone(db) === "session_open";
}

export function markSessionOpen(db: Database.Database): void {
  if (!tableExists(db, "app_session_tombstone")) return;
  const now = Date.now();
  db.prepare(
    `INSERT INTO app_session_tombstone (singleton, status, opened_at, closed_at)
     VALUES (1, 'session_open', ?, NULL)
     ON CONFLICT(singleton) DO UPDATE SET
       status = 'session_open',
       opened_at = excluded.opened_at,
       closed_at = NULL`,
  ).run(now);
}

export function markSessionClosed(db: Database.Database): void {
  if (!tableExists(db, "app_session_tombstone")) return;
  db.prepare(
    `UPDATE app_session_tombstone
     SET status = 'session_closed', closed_at = ?
     WHERE singleton = 1`,
  ).run(Date.now());
}

export function checkpointDatabase(db: Database.Database): void {
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch (err) {
    console.warn("[glassDatabase] WAL checkpoint failed:", err);
  }
}
