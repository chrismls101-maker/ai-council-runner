import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import {
  GLASS_DB_MIGRATION_V1,
  GLASS_DB_MIGRATION_V7_MODEL_CALLS,
} from "../main/glassDatabaseSchema.ts";
import { estimateApiModelCostUsd } from "../shared/coderAgentModels.ts";

function openTestDb(): Database.Database {
  const dir = mkdtempSync(join(tmpdir(), "glass-model-calls-"));
  const db = new Database(join(dir, "session-history.db"));
  db.exec(GLASS_DB_MIGRATION_V1);
  db.exec(GLASS_DB_MIGRATION_V7_MODEL_CALLS);
  return db;
}

test("estimateApiModelCostUsd resolves known API models", () => {
  const sonnet = estimateApiModelCostUsd("claude-sonnet-4-6", 1_000_000, 0);
  assert.ok(sonnet > 2.9 && sonnet < 3.1);
});

test("model_calls table stores per-call spend and aggregates per session", () => {
  const db = openTestDb();
  const sessionId = "sess-1";
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (
      id, created_at, updated_at, title, context_app, context_url, agent_type, status, token_count
    ) VALUES (?, ?, ?, ?, NULL, NULL, 'chat', 'active', 0)`,
  ).run(sessionId, now, now, "Test");

  const insert = db.prepare(
    `INSERT INTO model_calls (
      id, session_id, source, provider, model, agent_id, run_id, correlation_id,
      input_tokens, output_tokens, estimated_usd, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insert.run("c1", sessionId, "ask", "anthropic", "claude-sonnet-4-6", null, null, null, 100, 50, 0.01, now);
  insert.run("c2", sessionId, "coder", "anthropic", "claude-sonnet-4-6", "coder", "r1", null, 200, 100, 0.02, now + 1);

  const row = db
    .prepare(
      `SELECT COUNT(*) AS call_count,
              COALESCE(SUM(input_tokens), 0) AS input_tokens,
              COALESCE(SUM(output_tokens), 0) AS output_tokens,
              COALESCE(SUM(estimated_usd), 0) AS total_usd
       FROM model_calls WHERE session_id = ?`,
    )
    .get(sessionId) as {
      call_count: number;
      input_tokens: number;
      output_tokens: number;
      total_usd: number;
    };

  assert.equal(row.call_count, 2);
  assert.equal(row.input_tokens, 300);
  assert.equal(row.output_tokens, 150);
  assert.ok(Math.abs(row.total_usd - 0.03) < 0.0001);
  db.close();
});

test("model_calls rows are removed when session is deleted", () => {
  const db = openTestDb();
  const sessionId = "sess-2";
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (
      id, created_at, updated_at, title, context_app, context_url, agent_type, status, token_count
    ) VALUES (?, ?, ?, ?, NULL, NULL, 'chat', 'active', 0)`,
  ).run(sessionId, now, now, "Delete me");
  db.prepare(
    `INSERT INTO model_calls (
      id, session_id, source, provider, model, agent_id, run_id, correlation_id,
      input_tokens, output_tokens, estimated_usd, created_at
    ) VALUES (?, ?, 'ask', 'anthropic', 'claude-sonnet-4-6', NULL, NULL, NULL, 10, 5, 0.001, ?)`,
  ).run("c-del", sessionId, now);
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  const count = db.prepare("SELECT COUNT(*) AS n FROM model_calls").get() as { n: number };
  assert.equal(count.n, 0);
  db.close();
});
