/**
 * Glass session history — local SQLite in userData (session-history.db).
 * MAIN-PROCESS ONLY.
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { app } from "electron";
import { join } from "node:path";
import type {
  AgentRunRow,
  AgentRunStatus,
  MessageRow,
  SessionRow,
  SessionRowWithMeta,
  SessionStatus,
  UserContextRow,
} from "../shared/glassSessionHistory.ts";

export type {
  AgentRunRow,
  AgentRunStatus,
  MessageRow,
  SessionRow,
  SessionRowWithMeta,
  SessionStatus,
  UserContextRow,
} from "../shared/glassSessionHistory.ts";

const MIGRATION_V1 = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  title TEXT,
  context_app TEXT,
  context_url TEXT,
  agent_type TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  token_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  agent_id TEXT,
  token_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  run_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  input TEXT,
  output TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  error TEXT,
  correlation_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_context (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_correlation ON agent_runs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_session ON agent_runs(session_id);
`;

const MIGRATION_V2_MEMORIES = `
CREATE TABLE IF NOT EXISTS memories (
  id              TEXT PRIMARY KEY,
  session_id      TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  agent_id        TEXT,
  content         TEXT NOT NULL,
  summary         TEXT NOT NULL,
  embedding       BLOB NOT NULL,
  memory_type     TEXT NOT NULL,
  importance      REAL DEFAULT 0.5,
  created_at      INTEGER NOT NULL,
  accessed_at     INTEGER,
  access_count    INTEGER DEFAULT 0,
  confirmed_count INTEGER DEFAULT 0,
  provider        TEXT,
  tags            TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec USING vec0(
  embedding float[384]
);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content, summary, tags,
  content='memories',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS memories_after_insert AFTER INSERT ON memories BEGIN
  INSERT INTO memories_vec(rowid, embedding) VALUES (new.rowid, new.embedding);
  INSERT INTO memories_fts(rowid, content, summary, tags)
    VALUES (new.rowid, new.content, new.summary, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_after_delete AFTER DELETE ON memories BEGIN
  DELETE FROM memories_vec WHERE rowid = old.rowid;
  DELETE FROM memories_fts WHERE rowid = old.rowid;
END;
`;

const MIGRATION_V3_MEMORY_PENDING = `
CREATE TABLE IF NOT EXISTS memory_pending (
  id              TEXT PRIMARY KEY,
  session_id      TEXT,
  agent_id        TEXT,
  content         TEXT NOT NULL,
  summary         TEXT NOT NULL,
  memory_type     TEXT NOT NULL,
  importance      REAL DEFAULT 0.5,
  created_at      INTEGER NOT NULL,
  provider        TEXT,
  tags            TEXT
);
`;

const MIGRATION_V4_EXTRACTION_PENDING = `
CREATE TABLE IF NOT EXISTS extraction_pending (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  correlation_id  TEXT,
  transcript      TEXT NOT NULL,
  dedupe_tag      TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_extraction_pending_dedupe ON extraction_pending(dedupe_tag);
`;

let _db: Database.Database | null = null;
let _dbDisabled = false;
let _vecExtensionLoaded = false;

export function isVecExtensionLoaded(): boolean {
  return _vecExtensionLoaded;
}

export function dbFilePath(): string {
  return join(app.getPath("userData"), "session-history.db");
}

export function isDatabaseEnabled(): boolean {
  return !_dbDisabled && _db !== null;
}

function tableHasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?")
    .get(name) as { name: string } | undefined;
  return row != null;
}

function repairMemoryVecFtsIfNeeded(db: Database.Database): void {
  if (!tableExists(db, "memories")) return;
  if (tableExists(db, "memories_vec") && tableExists(db, "memories_fts")) return;
  loadVecExtension(db);
  try {
    db.exec(MIGRATION_V2_MEMORIES);
  } catch (err) {
    console.error("[glassDatabase] memory vec/fts repair failed:", err);
  }
}

function applyMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `);
  const row = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get() as
    | { version: number }
    | undefined;
  const current = row?.version ?? 0;
  if (current < 1) {
    db.exec(MIGRATION_V1);
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(1);
  }
  if (current < 2) {
    if (!tableHasColumn(db, "user_context", "embedding")) {
      db.exec("ALTER TABLE user_context ADD COLUMN embedding BLOB");
    }
    if (!tableHasColumn(db, "user_context", "memory_type")) {
      db.exec("ALTER TABLE user_context ADD COLUMN memory_type TEXT DEFAULT 'fact'");
    }
    loadVecExtension(db);
    try {
      db.exec(MIGRATION_V2_MEMORIES);
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(2);
    } catch (err) {
      console.error("[glassDatabase] V2 memories schema failed:", err);
    }
  }
  repairMemoryVecFtsIfNeeded(db);
  if (current < 3) {
    try {
      db.exec(MIGRATION_V3_MEMORY_PENDING);
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(3);
    } catch (err) {
      console.error("[glassDatabase] V3 memory_pending schema failed:", err);
    }
  }
  if (current < 4) {
    try {
      db.exec(MIGRATION_V4_EXTRACTION_PENDING);
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(4);
    } catch (err) {
      console.error("[glassDatabase] V4 extraction_pending schema failed:", err);
    }
  }
}

function loadVecExtension(db: Database.Database): void {
  if (_vecExtensionLoaded) return;
  try {
    sqliteVec.load(db as unknown as Parameters<typeof sqliteVec.load>[0]);
    _vecExtensionLoaded = true;
  } catch (err) {
    console.error("[glassDatabase] sqlite-vec load failed — ANN search disabled:", err);
  }
}

export function initDatabase(): void {
  if (_db || _dbDisabled) return;
  try {
    const db = new Database(dbFilePath());
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("foreign_keys = ON");
    db.pragma("cache_size = -32000");
    loadVecExtension(db);
    applyMigrations(db);
    _db = db;
  } catch (err) {
    _dbDisabled = true;
    console.error("[glassDatabase] init failed — session history disabled:", err);
  }
}

export function getDb(): Database.Database | null {
  if (_db) return _db;
  if (_dbDisabled) return null;
  initDatabase();
  return _db;
}

export function closeDatabase(): void {
  if (_db) {
    try {
      _db.close();
    } catch (err) {
      console.error("[glassDatabase] close error:", err);
    }
    _db = null;
  }
  _vecExtensionLoaded = false;
}
