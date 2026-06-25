/**
 * Glass session history — local SQLite in userData (session-history.db).
 * MAIN-PROCESS ONLY.
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { app } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  checkpointDatabase,
  detectUncleanShutdown,
  markSessionClosed,
  markSessionOpen,
  quarantineCorruptedDatabaseFiles,
  runIntegrityCheckOnFile,
} from "./glassDatabaseStartup.ts";
import type {
  AgentRunRow,
  AgentRunStatus,
  MessageRow,
  SessionRow,
  SessionRowWithMeta,
  SessionStatus,
  UserContextRow,
} from "../shared/glassSessionHistory.ts";
import { GLASS_DB_MIGRATION_V1, GLASS_DB_MIGRATION_V7_MODEL_CALLS } from "./glassDatabaseSchema.ts";

export type {
  AgentRunRow,
  AgentRunStatus,
  MessageRow,
  SessionRow,
  SessionRowWithMeta,
  SessionStatus,
  UserContextRow,
} from "../shared/glassSessionHistory.ts";

const MIGRATION_V1 = GLASS_DB_MIGRATION_V1;

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

const MIGRATION_V5_RETENTION_EVENTS = `
CREATE TABLE IF NOT EXISTS retention_events (
  id              TEXT PRIMARY KEY,
  event_name      TEXT NOT NULL,
  session_id      TEXT,
  created_at      INTEGER NOT NULL,
  meta            TEXT
);
CREATE INDEX IF NOT EXISTS idx_retention_events_name ON retention_events(event_name);
CREATE INDEX IF NOT EXISTS idx_retention_events_session ON retention_events(session_id);
CREATE INDEX IF NOT EXISTS idx_retention_events_time ON retention_events(created_at);
`;

const MIGRATION_V6_SESSION_TOMBSTONE = `
CREATE TABLE IF NOT EXISTS app_session_tombstone (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  status TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER
);
INSERT OR IGNORE INTO app_session_tombstone (singleton, status, opened_at, closed_at)
VALUES (1, 'session_closed', 0, 0);
`;

const MIGRATION_V7_MODEL_CALLS = GLASS_DB_MIGRATION_V7_MODEL_CALLS;

export type { SessionTombstoneStatus } from "./glassDatabaseStartup.ts";
export {
  checkpointDatabase,
  detectUncleanShutdown,
  markSessionClosed,
  markSessionOpen,
  parseIntegrityCheckResult,
  quarantineCorruptedDatabaseFiles,
  runIntegrityCheckOnFile,
} from "./glassDatabaseStartup.ts";

export interface DatabaseInitResult {
  enabled: boolean;
  recoveredFromCorruption: boolean;
  recoveredFromUncleanExit: boolean;
  corruptionBackupPath?: string;
}

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
  if (current < 5) {
    try {
      db.exec(MIGRATION_V5_RETENTION_EVENTS);
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(5);
    } catch (err) {
      console.error("[glassDatabase] V5 retention_events schema failed:", err);
    }
  }
  if (current < 6) {
    try {
      db.exec(MIGRATION_V6_SESSION_TOMBSTONE);
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(6);
    } catch (err) {
      console.error("[glassDatabase] V6 session tombstone schema failed:", err);
    }
  }
  if (current < 7) {
    try {
      db.exec(MIGRATION_V7_MODEL_CALLS);
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(7);
    } catch (err) {
      console.error("[glassDatabase] V7 model_calls schema failed:", err);
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

export function initDatabase(): DatabaseInitResult {
  const empty: DatabaseInitResult = {
    enabled: false,
    recoveredFromCorruption: false,
    recoveredFromUncleanExit: false,
  };
  if (_db || _dbDisabled) {
    return { ...empty, enabled: isDatabaseEnabled() };
  }

  const result: DatabaseInitResult = { ...empty };
  const path = dbFilePath();

  if (existsSync(path)) {
    const integrity = runIntegrityCheckOnFile(path);
    if (!integrity.ok) {
      console.error("[glassDatabase] integrity_check failed:", integrity.detail);
      result.recoveredFromCorruption = true;
      result.corruptionBackupPath = quarantineCorruptedDatabaseFiles(path);
    }
  }

  try {
    const db = new Database(path);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("foreign_keys = ON");
    db.pragma("cache_size = -32000");
    loadVecExtension(db);
    applyMigrations(db);
    result.recoveredFromUncleanExit = detectUncleanShutdown(db);
    markSessionOpen(db);
    _db = db;
    result.enabled = true;
  } catch (err) {
    _dbDisabled = true;
    console.error("[glassDatabase] init failed — session history disabled:", err);
  }
  return result;
}

export function getDb(): Database.Database | null {
  if (_db) return _db;
  if (_dbDisabled) return null;
  const result = initDatabase();
  return result.enabled ? _db : null;
}

export function gracefulDatabaseShutdown(): void {
  if (!_db) return;
  try {
    markSessionClosed(_db);
    checkpointDatabase(_db);
  } catch (err) {
    console.error("[glassDatabase] graceful shutdown failed:", err);
  }
}

export function closeDatabase(): void {
  if (_db) {
    try {
      gracefulDatabaseShutdown();
      _db.close();
    } catch (err) {
      console.error("[glassDatabase] close error:", err);
    }
    _db = null;
  }
  _vecExtensionLoaded = false;
}
