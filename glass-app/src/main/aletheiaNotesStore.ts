/**
 * Aletheia notes store (B4.2) — SQLite-backed session notes.
 *
 * Aletheia reads/writes notes during companion sessions. Glass Memory admin
 * owns export/delete-all for durable Glass memory — not individual Aletheia notes.
 */

import { getDb } from "./glassDatabase.ts";
import {
  buildAletheiaNotesSnapshot,
  createAletheiaNote,
  updateAletheiaNoteBody,
  type AletheiaNote,
  type AletheiaNotesSnapshot,
  type AppendAletheiaNoteInput,
} from "../shared/aletheiaNotes.ts";

function rowToNote(row: {
  id: string;
  body: string;
  rationale: string | null;
  category: string;
  source: string;
  session_id: string | null;
  linked_project_id: string | null;
  created_at: number;
  updated_at: number;
}): AletheiaNote {
  return {
    id: row.id,
    body: row.body,
    rationale: row.rationale ?? undefined,
    category: row.category as AletheiaNote["category"],
    source: row.source as AletheiaNote["source"],
    sessionId: row.session_id ?? undefined,
    linkedProjectId: row.linked_project_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createAletheiaNotesTable(): void {
  const db = getDb();
  if (!db) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS aletheia_notes (
        id          TEXT PRIMARY KEY,
        body        TEXT NOT NULL,
        rationale   TEXT,
        category    TEXT NOT NULL,
        source      TEXT NOT NULL,
        session_id  TEXT,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_aletheia_notes_updated
        ON aletheia_notes (updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_aletheia_notes_session
        ON aletheia_notes (session_id, updated_at DESC);
    `);
    try {
      db.exec(`ALTER TABLE aletheia_notes ADD COLUMN linked_project_id TEXT`);
    } catch {
      /* column exists */
    }
    try {
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_aletheia_notes_linked_project
         ON aletheia_notes (linked_project_id, updated_at DESC)`,
      );
    } catch {
      /* ignore */
    }
  } catch (err) {
    console.error("[aletheiaNotesStore] createAletheiaNotesTable error:", err);
  }
}

export function listAletheiaNotes(limit = 50): AletheiaNotesSnapshot {
  const db = getDb();
  if (!db) return buildAletheiaNotesSnapshot([]);

  try {
    const rows = db
      .prepare(
        `SELECT id, body, rationale, category, source, session_id, linked_project_id, created_at, updated_at
         FROM aletheia_notes
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .all(limit) as Array<{
        id: string;
        body: string;
        rationale: string | null;
        category: string;
        source: string;
        session_id: string | null;
        linked_project_id: string | null;
        created_at: number;
        updated_at: number;
      }>;
    return buildAletheiaNotesSnapshot(rows.map(rowToNote));
  } catch (err) {
    console.error("[aletheiaNotesStore] listAletheiaNotes error:", err);
    return buildAletheiaNotesSnapshot([]);
  }
}

export function appendAletheiaNote(input: AppendAletheiaNoteInput): AletheiaNote | null {
  const body = input.body.trim();
  if (!body) return null;

  const note = createAletheiaNote(input);
  const db = getDb();
  if (!db) return note;

  try {
    db.prepare(
      `INSERT INTO aletheia_notes
        (id, body, rationale, category, source, session_id, linked_project_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      note.id,
      note.body,
      note.rationale ?? null,
      note.category,
      note.source,
      note.sessionId ?? null,
      note.linkedProjectId ?? null,
      note.createdAt,
      note.updatedAt,
    );
  } catch (err) {
    console.error("[aletheiaNotesStore] appendAletheiaNote error:", err);
  }
  return note;
}

export function updateAletheiaNote(noteId: string, body: string): AletheiaNote | null {
  const db = getDb();
  if (!db) return null;

  try {
    const existing = db
      .prepare(
        `SELECT id, body, rationale, category, source, session_id, linked_project_id, created_at, updated_at
         FROM aletheia_notes WHERE id = ?`,
      )
      .get(noteId) as {
        id: string;
        body: string;
        rationale: string | null;
        category: string;
        source: string;
        session_id: string | null;
        linked_project_id: string | null;
        created_at: number;
        updated_at: number;
      } | undefined;
    if (!existing) return null;

    const updated = updateAletheiaNoteBody(rowToNote(existing), body);
    db.prepare(`UPDATE aletheia_notes SET body = ?, updated_at = ? WHERE id = ?`).run(
      updated.body,
      updated.updatedAt,
      noteId,
    );
    return updated;
  } catch (err) {
    console.error("[aletheiaNotesStore] updateAletheiaNote error:", err);
    return null;
  }
}

export function deleteAletheiaNote(noteId: string): boolean {
  const db = getDb();
  if (!db) return false;
  try {
    const result = db.prepare(`DELETE FROM aletheia_notes WHERE id = ?`).run(noteId);
    return result.changes > 0;
  } catch (err) {
    console.error("[aletheiaNotesStore] deleteAletheiaNote error:", err);
    return false;
  }
}
