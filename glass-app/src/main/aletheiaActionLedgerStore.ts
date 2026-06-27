/**
 * AletheiaExecutionLedger — durable SQLite log of every pipeline step (P0.1).
 *
 * Architecture law: every action attempt, confirmation, result, and rollback
 * is recorded. Aletheia dashboard may read recent entries; delete/export is Glass admin.
 */

import { getDb } from "./glassDatabase.ts";
import type { ActionIntent, ActionLedgerEntry, ActionResult, PipelineStage } from "../shared/aletheiaExecution.ts";
import { makeLedgerEntryId, narrationForStage } from "../shared/aletheiaExecution.ts";

export function createAletheiaActionLedgerTable(): void {
  const db = getDb();
  if (!db) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS aletheia_action_ledger (
        id            TEXT PRIMARY KEY,
        intent_id     TEXT NOT NULL,
        session_id    TEXT,
        stage         TEXT NOT NULL,
        kind          TEXT NOT NULL,
        summary       TEXT NOT NULL,
        narration     TEXT NOT NULL,
        payload_json  TEXT,
        ok            INTEGER,
        error_message TEXT,
        created_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_aletheia_action_ledger_intent
        ON aletheia_action_ledger (intent_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_aletheia_action_ledger_created
        ON aletheia_action_ledger (created_at DESC);
    `);
  } catch (err) {
    console.error("[aletheiaActionLedgerStore] createAletheiaActionLedgerTable error:", err);
  }
}

export function appendActionLedgerEntry(input: {
  intent: ActionIntent;
  stage: PipelineStage;
  narration?: string;
  ok?: boolean | null;
  errorMessage?: string | null;
}): ActionLedgerEntry {
  const entry: ActionLedgerEntry = {
    id: makeLedgerEntryId(),
    intentId: input.intent.id,
    sessionId: input.intent.sessionId || null,
    stage: input.stage,
    kind: input.intent.kind,
    summary: input.intent.summary,
    narration: input.narration ?? narrationForStage(input.intent, input.stage),
    payloadJson: JSON.stringify(input.intent.payload),
    ok: input.ok ?? null,
    errorMessage: input.errorMessage ?? null,
    createdAt: Date.now(),
  };

  const db = getDb();
  if (!db) return entry;

  try {
    db.prepare(
      `INSERT INTO aletheia_action_ledger
        (id, intent_id, session_id, stage, kind, summary, narration, payload_json, ok, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      entry.id,
      entry.intentId,
      entry.sessionId,
      entry.stage,
      entry.kind,
      entry.summary,
      entry.narration,
      entry.payloadJson,
      entry.ok === null || entry.ok === undefined ? null : entry.ok ? 1 : 0,
      entry.errorMessage,
      entry.createdAt,
    );
  } catch (err) {
    console.error("[aletheiaActionLedgerStore] appendActionLedgerEntry error:", err);
  }

  return entry;
}

export function appendResultLedgerEntry(intent: ActionIntent, result: ActionResult): ActionLedgerEntry {
  const stage = result.ok ? "complete" : "failed";
  return appendActionLedgerEntry({
    intent,
    stage,
    narration: narrationForStage(intent, stage, result),
    ok: result.ok,
    errorMessage: result.errorMessage ?? null,
  });
}

export function getRecentActionLedgerEntries(limit: number): ActionLedgerEntry[] {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = db
      .prepare(
        `SELECT id, intent_id, session_id, stage, kind, summary, narration, payload_json, ok, error_message, created_at
         FROM aletheia_action_ledger
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(limit) as Array<{
        id: string;
        intent_id: string;
        session_id: string | null;
        stage: PipelineStage;
        kind: ActionIntent["kind"];
        summary: string;
        narration: string;
        payload_json: string | null;
        ok: number | null;
        error_message: string | null;
        created_at: number;
      }>;

    return rows.map((row) => ({
      id: row.id,
      intentId: row.intent_id,
      sessionId: row.session_id,
      stage: row.stage,
      kind: row.kind,
      summary: row.summary,
      narration: row.narration,
      payloadJson: row.payload_json,
      ok: row.ok === null ? null : row.ok === 1,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.error("[aletheiaActionLedgerStore] getRecentActionLedgerEntries error:", err);
    return [];
  }
}

export function getActionLedgerForIntent(intentId: string): ActionLedgerEntry[] {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = db
      .prepare(
        `SELECT id, intent_id, session_id, stage, kind, summary, narration, payload_json, ok, error_message, created_at
         FROM aletheia_action_ledger
         WHERE intent_id = ?
         ORDER BY created_at ASC`,
      )
      .all(intentId) as Array<{
        id: string;
        intent_id: string;
        session_id: string | null;
        stage: PipelineStage;
        kind: ActionIntent["kind"];
        summary: string;
        narration: string;
        payload_json: string | null;
        ok: number | null;
        error_message: string | null;
        created_at: number;
      }>;

    return rows.map((row) => ({
      id: row.id,
      intentId: row.intent_id,
      sessionId: row.session_id,
      stage: row.stage,
      kind: row.kind,
      summary: row.summary,
      narration: row.narration,
      payloadJson: row.payload_json,
      ok: row.ok === null ? null : row.ok === 1,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.error("[aletheiaActionLedgerStore] getActionLedgerForIntent error:", err);
    return [];
  }
}
