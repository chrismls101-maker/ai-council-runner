/**
 * Session + message persistence for Glass dashboard history.
 */

import { randomUUID } from "crypto";
import { existsSync, statSync } from "node:fs";
import type { GlassUserProfile } from "../shared/glassUserProfile.ts";
import { dbFilePath, getDb, type MessageRow, type SessionRowWithMeta, type UserContextRow } from "./glassDatabase.ts";
import { pruneStaleMemories } from "./glassMemoryEngine.ts";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const SIZE_WARN_BYTES = 400 * 1024 * 1024;

export interface CreateSessionOpts {
  id: string;
  agentType: string;
  contextApp?: string;
  contextUrl?: string;
  title?: string;
}

export interface AddMessageOpts {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  agentId?: string;
  tokenCount?: number;
}

export function createSession(opts: CreateSessionOpts): void {
  const db = getDb();
  if (!db) return;
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO sessions (
      id, created_at, updated_at, title, context_app, context_url, agent_type, status, token_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 0)`,
  ).run(
    opts.id,
    now,
    now,
    opts.title ?? null,
    opts.contextApp ?? null,
    opts.contextUrl ?? null,
    opts.agentType,
  );
}

export function ensureSession(
  sessionId: string,
  opts: Omit<CreateSessionOpts, "id">,
): void {
  createSession({ id: sessionId, ...opts });
}

export function touchSession(sessionId: string): void {
  const db = getDb();
  if (!db) return;
  db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(Date.now(), sessionId);
}

export function addMessage(opts: AddMessageOpts): void {
  const db = getDb();
  if (!db) return;
  const now = Date.now();
  const tokenCount = opts.tokenCount ?? 0;
  const insert = db.prepare(
    `INSERT INTO messages (id, session_id, role, content, created_at, agent_id, token_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const touch = db.prepare(
    `UPDATE sessions SET updated_at = ?, token_count = token_count + ? WHERE id = ?`,
  );
  const write = db.transaction(() => {
    insert.run(
      opts.id,
      opts.sessionId,
      opts.role,
      opts.content,
      now,
      opts.agentId ?? null,
      tokenCount,
    );
    touch.run(now, tokenCount, opts.sessionId);
  });
  write();
}

export function archiveSession(sessionId: string): void {
  const db = getDb();
  if (!db) return;
  db.prepare(
    `UPDATE sessions SET status = 'archived', updated_at = ? WHERE id = ?`,
  ).run(Date.now(), sessionId);
}

export function getRecentSessions(limit = 20): SessionRowWithMeta[] {
  const db = getDb();
  if (!db) return [];
  const rows = db
    .prepare(
      `SELECT
        s.id,
        s.created_at,
        s.updated_at,
        s.title,
        s.context_app,
        s.context_url,
        s.agent_type,
        s.status,
        s.token_count,
        (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count,
        (
          SELECT m2.content FROM messages m2
          WHERE m2.session_id = s.id
          ORDER BY m2.created_at ASC
          LIMIT 1
        ) AS first_message_preview,
        (
          SELECT COALESCE(SUM(mc.estimated_usd), 0)
          FROM model_calls mc WHERE mc.session_id = s.id
        ) AS spend_usd,
        (
          SELECT COUNT(*) FROM model_calls mc WHERE mc.session_id = s.id
        ) AS model_call_count
      FROM sessions s
      ORDER BY s.updated_at DESC
      LIMIT ?`,
    )
    .all(limit) as SessionRowWithMeta[];
  return rows;
}

export function getSessionMeta(
  sessionId: string,
): { title: string | null; agentType: string | null } | null {
  const db = getDb();
  if (!db) return null;
  const row = db
    .prepare("SELECT title, agent_type FROM sessions WHERE id = ?")
    .get(sessionId) as { title: string | null; agent_type: string | null } | undefined;
  if (!row) return null;
  return { title: row.title, agentType: row.agent_type };
}

export function persistChatExchange(
  sessionId: string,
  userText: string,
  assistantText: string,
  opts?: { agentId?: string; title?: string; contextApp?: string },
): void {
  const db = getDb();
  if (!db) return;
  ensureSession(sessionId, {
    agentType: opts?.agentId ?? "chat",
    title: opts?.title ?? (userText.slice(0, 80) || undefined),
    contextApp: opts?.contextApp,
  });
  const userContent = userText.trim();
  const assistantContent = assistantText.trim();
  if (userContent) {
    addMessage({
      id: randomUUID(),
      sessionId,
      role: "user",
      content: userContent,
      agentId: opts?.agentId,
    });
  }
  if (assistantContent) {
    addMessage({
      id: randomUUID(),
      sessionId,
      role: "assistant",
      content: assistantContent,
      agentId: opts?.agentId,
      tokenCount: Math.ceil(assistantContent.length / 4),
    });
  }
  touchSession(sessionId);
}

export function getSessionMessages(sessionId: string): MessageRow[] {
  const db = getDb();
  if (!db) return [];
  return db
    .prepare(
      `SELECT id, session_id, role, content, created_at, agent_id, token_count
       FROM messages WHERE session_id = ? ORDER BY created_at ASC`,
    )
    .all(sessionId) as MessageRow[];
}

export function checkDatabaseSize(path = dbFilePath()): void {
  const db = getDb();
  if (!db || !existsSync(path)) return;
  try {
    const size = statSync(path).size;
    if (size <= SIZE_WARN_BYTES) return;
    const cutoff = Date.now() - FORTY_EIGHT_HOURS_MS;
    db.prepare(
      `UPDATE agent_runs SET input = NULL, output = NULL
       WHERE COALESCE(completed_at, started_at, 0) < ?`,
    ).run(cutoff);
    db.exec("VACUUM");
    console.warn(`[sessionHistory] DB exceeded ${SIZE_WARN_BYTES} bytes — pruned agent_run blobs`);
  } catch (err) {
    console.error("[sessionHistory] checkDatabaseSize error:", err);
  }
}

export function pruneHistory(): void {
  const db = getDb();
  if (!db) return;
  try {
    const now = Date.now();
    const archivedCutoff = now - NINETY_DAYS_MS;
    db.prepare(
      `DELETE FROM sessions WHERE status = 'archived' AND updated_at < ?`,
    ).run(archivedCutoff);

    const staleCutoff = now - THIRTY_DAYS_MS;
    db.prepare(
      `UPDATE sessions SET status = 'archived', updated_at = ?
       WHERE status = 'active' AND updated_at < ?`,
    ).run(now, staleCutoff);

    const blobCutoff = now - SEVEN_DAYS_MS;
    db.prepare(
      `UPDATE agent_runs SET input = NULL, output = NULL
       WHERE COALESCE(completed_at, started_at, 0) < ?`,
    ).run(blobCutoff);

    pruneStaleMemories();

    db.exec("VACUUM");
    checkDatabaseSize();
  } catch (err) {
    console.error("[sessionHistory] pruneHistory error:", err);
  }
}

export function seedUserContextFromProfile(profile: GlassUserProfile | null | undefined): void {
  const db = getDb();
  if (!db || !profile) return;
  const entries: Array<{ key: string; value: string }> = [];
  if (profile.name.trim()) entries.push({ key: "name", value: profile.name.trim() });
  if (profile.usualWork.trim()) entries.push({ key: "usualWork", value: profile.usualWork.trim() });
  if (profile.currentFocus.trim()) entries.push({ key: "currentFocus", value: profile.currentFocus.trim() });
  if (entries.length === 0) return;

  const insert = db.prepare(
    `INSERT OR IGNORE INTO user_context (key, value, source, confidence, created_at, updated_at)
     VALUES (?, ?, 'onboarding', 1, ?, ?)`,
  );
  const now = Date.now();
  for (const entry of entries) {
    insert.run(entry.key, entry.value, now, now);
  }
}

export function getUserContext(): UserContextRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    return db
      .prepare("SELECT key, value, source, confidence, created_at, updated_at FROM user_context ORDER BY updated_at DESC")
      .all() as UserContextRow[];
  } catch (err) {
    console.error("[sessionHistory] getUserContext error:", err);
    return [];
  }
}

export function deleteUserContextKey(key: string): boolean {
  const db = getDb();
  const trimmed = key.trim();
  if (!db || !trimmed) return false;
  try {
    db.prepare("DELETE FROM user_context WHERE key = ?").run(trimmed);
    return true;
  } catch (err) {
    console.error("[sessionHistory] deleteUserContextKey error:", err);
    return false;
  }
}
