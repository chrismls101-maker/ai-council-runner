/**
 * Aletheia companion session store — SQLite-backed.
 *
 * Architecture law:
 *   - Aletheia presents session recap and continuity. She does NOT own durable
 *     memory admin.
 *   - Glass owns export, deletion, and admin surfaces for durable memory.
 *   - This store is for Aletheia session recap only — lightweight, NOT the
 *     full session message history (see sessionHistoryStore.ts).
 *   - `deleteAletheiaSessions()` is Glass Memory admin only; never call it
 *     from Aletheia-gated IPC handlers.
 *
 * Data boundary:
 *   - Aletheia reads her own session list for continuity (getRecentAletheiaSessions).
 *   - Glass Memory admin panel owns export / delete / wipe.
 */

import { getDb } from "./glassDatabase.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AletheiaSessionRow {
  id: string;
  started_at: number;
  ended_at: number | null;
  turn_count: number;
  front_app: string | null;
  summary: string | null;
  created_at: number;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export function createAletheiaSessionsTable(): void {
  const db = getDb();
  if (!db) return;
  try {
    db.exec(`
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
    `);
  } catch (err) {
    console.error("[aletheiaSessionStore] createAletheiaSessionsTable error:", err);
  }
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Called when companion mode activates. Creates a new session row.
 * No-op if the DB is unavailable.
 */
export function startAletheiaSession(
  id: string,
  startedAt: number,
  frontApp?: string,
): void {
  const db = getDb();
  if (!db) return;
  try {
    db.prepare(
      `INSERT OR IGNORE INTO aletheia_sessions (id, started_at, front_app, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(id, startedAt, frontApp ?? null, Date.now());
  } catch (err) {
    console.error("[aletheiaSessionStore] startAletheiaSession error:", err);
  }
}

/**
 * Called when companion mode deactivates. Stamps ended_at, turn count, and
 * optional summary. Summary is truncated to 500 chars to match schema intent.
 */
export function endAletheiaSession(
  id: string,
  endedAt: number,
  turnCount: number,
  summary?: string,
): void {
  const db = getDb();
  if (!db) return;
  const safeSummary = summary ? summary.slice(0, 500) : null;
  try {
    db.prepare(
      `UPDATE aletheia_sessions
       SET ended_at = ?, turn_count = ?, summary = ?
       WHERE id = ?`,
    ).run(endedAt, turnCount, safeSummary, id);
  } catch (err) {
    console.error("[aletheiaSessionStore] endAletheiaSession error:", err);
  }
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/**
 * Returns the most recent Aletheia sessions ordered newest-first.
 * Used by the Aletheia recap panel — limit kept small by convention.
 */
export function getRecentAletheiaSessions(limit: number): AletheiaSessionRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    return db
      .prepare(
        `SELECT id, started_at, ended_at, turn_count, front_app, summary, created_at
         FROM aletheia_sessions
         ORDER BY started_at DESC
         LIMIT ?`,
      )
      .all(limit) as AletheiaSessionRow[];
  } catch (err) {
    console.error("[aletheiaSessionStore] getRecentAletheiaSessions error:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Admin / Glass Memory only — never call from Aletheia IPC handlers
// ---------------------------------------------------------------------------

/**
 * Wipes all Aletheia session rows.
 * GLASS MEMORY ADMIN ONLY — must only be called from dashboardIpc.ts,
 * never from aletheiaDashboardIpc.ts.
 */
export function deleteAletheiaSessions(): void {
  const db = getDb();
  if (!db) return;
  try {
    db.prepare("DELETE FROM aletheia_sessions").run();
  } catch (err) {
    console.error("[aletheiaSessionStore] deleteAletheiaSessions error:", err);
  }
}
