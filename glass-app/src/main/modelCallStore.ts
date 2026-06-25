/**
 * Per-session model call spend — one SQLite row per inference API call.
 */

import { randomUUID } from "crypto";
import { getDb } from "./glassDatabase.ts";
import { ensureSession } from "./sessionHistoryStore.ts";
import { estimateApiModelCostUsd } from "../shared/coderAgentModels.ts";

export type ModelCallSource =
  | "ask"
  | "ask_stream"
  | "coder"
  | "council"
  | "memory"
  | "terminal_fix"
  | "other";

export interface RecordModelCallOpts {
  sessionId?: string | null;
  source: ModelCallSource;
  model: string;
  provider?: "anthropic" | "openai";
  inputTokens: number;
  outputTokens: number;
  estimatedUsd?: number;
  agentId?: string;
  runId?: string;
  correlationId?: string;
}

export interface ModelCallRow {
  id: string;
  session_id: string;
  source: string;
  provider: string | null;
  model: string;
  agent_id: string | null;
  run_id: string | null;
  correlation_id: string | null;
  input_tokens: number;
  output_tokens: number;
  estimated_usd: number;
  created_at: number;
}

export interface SessionSpendSummary {
  sessionId: string;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  totalUsd: number;
}

function sourceToAgentType(source: ModelCallSource): string {
  switch (source) {
    case "ask":
    case "ask_stream":
      return "chat";
    case "coder":
      return "coder";
    case "council":
      return "council";
    case "memory":
      return "memory";
    case "terminal_fix":
      return "terminal";
    default:
      return "other";
  }
}

/** Record one inference call. No-op when DB disabled or session id missing. */
export function recordModelCall(opts: RecordModelCallOpts): void {
  const sessionId = opts.sessionId?.trim();
  const inputTokens = Math.max(0, Math.floor(opts.inputTokens));
  const outputTokens = Math.max(0, Math.floor(opts.outputTokens));
  if (!sessionId || (inputTokens === 0 && outputTokens === 0)) return;

  const db = getDb();
  if (!db) return;

  try {
    ensureSession(sessionId, { agentType: opts.agentId ?? sourceToAgentType(opts.source) });

    const estimatedUsd =
      opts.estimatedUsd ??
      estimateApiModelCostUsd(opts.model, inputTokens, outputTokens);

    db.prepare(
      `INSERT INTO model_calls (
        id, session_id, source, provider, model, agent_id, run_id, correlation_id,
        input_tokens, output_tokens, estimated_usd, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      sessionId,
      opts.source,
      opts.provider ?? null,
      opts.model,
      opts.agentId ?? null,
      opts.runId ?? null,
      opts.correlationId ?? null,
      inputTokens,
      outputTokens,
      estimatedUsd,
      Date.now(),
    );
  } catch (err) {
    console.error("[modelCallStore] recordModelCall failed:", err);
  }
}

export function getSessionSpendSummary(sessionId: string): SessionSpendSummary {
  const empty: SessionSpendSummary = {
    sessionId,
    callCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalUsd: 0,
  };
  const db = getDb();
  if (!db) return empty;

  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS call_count,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(estimated_usd), 0) AS total_usd
       FROM model_calls WHERE session_id = ?`,
    )
    .get(sessionId) as
    | {
        call_count: number;
        input_tokens: number;
        output_tokens: number;
        total_usd: number;
      }
    | undefined;

  if (!row) return empty;
  return {
    sessionId,
    callCount: row.call_count,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalUsd: row.total_usd,
  };
}

export function getSessionModelCalls(sessionId: string, limit = 50): ModelCallRow[] {
  const db = getDb();
  if (!db) return [];
  return db
    .prepare(
      `SELECT id, session_id, source, provider, model, agent_id, run_id, correlation_id,
              input_tokens, output_tokens, estimated_usd, created_at
       FROM model_calls
       WHERE session_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(sessionId, limit) as ModelCallRow[];
}
