/**
 * scrollbackStore — Persistent Smart Scrollback (Task #47).
 *
 * Every finished terminal command (command text + truncated output) is encrypted
 * with AES-256-GCM and persisted to a local SQLite database in the app userData
 * directory. A short plaintext command summary is kept un-encrypted so Claude can
 * search over recent history by natural language; the full command + output are
 * only decrypted when a specific row is selected.
 *
 * Encryption key lifecycle:
 *   - Generated once (32 random bytes) on first use.
 *   - The key (hex) is itself encrypted via Electron `safeStorage` (OS keychain)
 *     and written to `scrollback.key` with 0600 perms.
 *   - On later launches the key file is decrypted back into memory.
 *   - If safeStorage is unavailable, persistence is disabled gracefully (no crash).
 *
 * This module is MAIN-PROCESS ONLY — it must never be imported from the renderer
 * or preload (it touches `better-sqlite3`, `fs`, and the OS keychain).
 */

import Database from "better-sqlite3";
import { app, safeStorage } from "electron";
import * as crypto from "node:crypto";
import * as path from "node:path";
import * as fs from "node:fs";

export { normalizeScrollbackWriteBlocks, parseScrollbackSearchIds } from "./scrollbackValidation.ts";

// ── Encryption ──────────────────────────────────────────────────────────────
// Key stored encrypted in userData dir using safeStorage (OS keychain).
function keyFilePath(): string {
  return path.join(app.getPath("userData"), "scrollback.key");
}
function dbFilePath(): string {
  return path.join(app.getPath("userData"), "scrollback.db");
}

let _encKey: Buffer | null = null;

/**
 * Returns the AES key, creating + persisting it on first call.
 * Throws if safeStorage encryption is unavailable on this OS.
 */
function getEncKey(): Buffer {
  if (_encKey) return _encKey;

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("safeStorage encryption unavailable — scrollback disabled");
  }

  const keyFile = keyFilePath();
  if (fs.existsSync(keyFile)) {
    const encrypted = fs.readFileSync(keyFile);
    const hex = safeStorage.decryptString(encrypted);
    _encKey = Buffer.from(hex, "hex");
  } else {
    const key = crypto.randomBytes(32);
    const encrypted = safeStorage.encryptString(key.toString("hex"));
    fs.writeFileSync(keyFile, encrypted, { mode: 0o600 });
    _encKey = key;
  }
  return _encKey;
}

function encrypt(text: string): Buffer {
  const key = getEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv (12) + authTag (16) + ciphertext
  return Buffer.concat([iv, authTag, ciphertext]);
}

function decrypt(buf: Buffer): string {
  const key = getEncKey();
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

// ── Database ─────────────────────────────────────────────────────────────────
let _db: Database.Database | null = null;
/** Set true once getDb() fails so we stop retrying noisily on every write. */
let _dbDisabled = false;

function getDb(): Database.Database | null {
  if (_db) return _db;
  if (_dbDisabled) return null;
  try {
    const db = new Database(dbFilePath());
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL UNIQUE,
        project_root TEXT,
        started_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        command_enc BLOB NOT NULL,
        output_enc BLOB NOT NULL,
        command_plain TEXT NOT NULL,
        exit_code INTEGER,
        status TEXT NOT NULL,
        cwd TEXT,
        started_at INTEGER NOT NULL,
        duration_ms INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      );
      CREATE INDEX IF NOT EXISTS idx_commands_session ON commands(session_id);
      CREATE INDEX IF NOT EXISTS idx_commands_started ON commands(started_at);
    `);
    _db = db;
    return _db;
  } catch (e) {
    _dbDisabled = true;
    console.error("[scrollback] getDb error — persistence disabled:", e);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export interface ScrollbackBlock {
  sessionId: string;
  command: string;
  output: string;
  exitCode?: number;
  status: "success" | "error" | "unknown";
  cwd?: string;
  startedAt: number;
  durationMs?: number;
}

export interface ScrollbackResult {
  id: number;
  command: string;
  output: string;
  status: "success" | "error" | "unknown";
  exitCode?: number;
  cwd?: string;
  startedAt: number;
  durationMs?: number;
  sessionId: string;
}

export function registerSession(sessionId: string, projectRoot?: string): void {
  try {
    const db = getDb();
    if (!db) return;
    db.prepare(
      `INSERT OR IGNORE INTO sessions (session_id, project_root, started_at) VALUES (?, ?, ?)`,
    ).run(sessionId, projectRoot ?? null, Date.now());
  } catch (e) {
    console.error("[scrollback] registerSession error:", e);
  }
}

export function writeBlocks(blocks: ScrollbackBlock[]): void {
  try {
    const db = getDb();
    if (!db) return;
    const insert = db.prepare(`
      INSERT INTO commands
        (session_id, command_enc, output_enc, command_plain, exit_code, status, cwd, started_at, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((items: ScrollbackBlock[]) => {
      for (const b of items) {
        const commandPlain = b.command.slice(0, 120); // plaintext summary for search
        const outputTrunc = b.output.slice(0, 2000); // truncate before encrypt
        insert.run(
          b.sessionId,
          encrypt(b.command),
          encrypt(outputTrunc),
          commandPlain,
          b.exitCode ?? null,
          b.status,
          b.cwd ?? null,
          b.startedAt,
          b.durationMs ?? null,
        );
      }
    });
    insertMany(blocks);
  } catch (e) {
    console.error("[scrollback] writeBlocks error:", e);
  }
}

export function getRecentSummary(
  limit = 200,
): Array<{ id: number; command_plain: string; status: string; cwd: string | null; started_at: number }> {
  try {
    const db = getDb();
    if (!db) return [];
    return db
      .prepare(
        `SELECT id, command_plain, status, cwd, started_at FROM commands ORDER BY started_at DESC LIMIT ?`,
      )
      .all(limit) as Array<{
      id: number;
      command_plain: string;
      status: string;
      cwd: string | null;
      started_at: number;
    }>;
  } catch (e) {
    console.error("[scrollback] getRecentSummary error:", e);
    return [];
  }
}

function rowToScrollbackResult(row: {
  id: number;
  command_enc: Buffer;
  output_enc: Buffer;
  exit_code: number | null;
  status: string;
  cwd: string | null;
  started_at: number;
  duration_ms: number | null;
  session_id: string;
}): ScrollbackResult {
  return {
    id: row.id,
    command: decrypt(row.command_enc),
    output: decrypt(row.output_enc),
    status: row.status as "success" | "error" | "unknown",
    exitCode: row.exit_code ?? undefined,
    cwd: row.cwd ?? undefined,
    startedAt: row.started_at,
    durationMs: row.duration_ms ?? undefined,
    sessionId: row.session_id,
  };
}

export function getByIds(ids: number[]): ScrollbackResult[] {
  if (ids.length === 0) return [];
  try {
    const db = getDb();
    if (!db) return [];
    const placeholders = ids.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT id, command_enc, output_enc, exit_code, status, cwd, started_at, duration_ms, session_id
         FROM commands WHERE id IN (${placeholders})`,
      )
      .all(...ids) as Array<{
      id: number;
      command_enc: Buffer;
      output_enc: Buffer;
      exit_code: number | null;
      status: string;
      cwd: string | null;
      started_at: number;
      duration_ms: number | null;
      session_id: string;
    }>;
    return rows.map(rowToScrollbackResult);
  } catch (e) {
    console.error("[scrollback] getByIds error:", e);
    return [];
  }
}

/** Fetch rows and return them in the same order as Claude's ranked ID list. */
export function getByIdsInOrder(ids: number[]): ScrollbackResult[] {
  const rows = getByIds(ids);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is ScrollbackResult => row != null);
}

export function closeDb(): void {
  try {
    _db?.close();
  } catch {
    /* best-effort on quit */
  }
  _db = null;
}
