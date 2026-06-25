/**
 * Core SQLite schema for fresh-install tests (no Electron imports).
 * Keep in sync with MIGRATION_V1 in glassDatabase.ts.
 */

export const GLASS_DB_MIGRATION_V1 = `
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

export const GLASS_DB_MIGRATION_V7_MODEL_CALLS = `
CREATE TABLE IF NOT EXISTS model_calls (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  provider TEXT,
  model TEXT NOT NULL,
  agent_id TEXT,
  run_id TEXT,
  correlation_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_usd REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_model_calls_session ON model_calls(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_model_calls_time ON model_calls(created_at);
`;

export const GLASS_DB_CORE_TABLES = [
  "sessions",
  "messages",
  "agent_runs",
  "user_context",
] as const;
