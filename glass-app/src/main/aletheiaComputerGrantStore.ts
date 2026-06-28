/**
 * Persistent "Always allow" grants for Aletheia computer operator (SQLite).
 */

import { randomUUID } from "node:crypto";
import type { OperatorActionKind } from "../shared/aletheiaComputerOperatorTypes.ts";
import { getDb } from "./glassDatabase.ts";
import { createAletheiaSessionsTable } from "./aletheiaSessionStore.ts";

export interface ComputerOperatorPersistentGrantRow {
  id: string;
  targetApp: string;
  allowedActions: OperatorActionKind[];
  scope: string;
  maxSteps: number;
  declaration: string;
  createdAt: number;
}

function parseAllowedActions(json: string): OperatorActionKind[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is OperatorActionKind => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function hashComputerOperatorAllowedActions(actions: OperatorActionKind[]): string {
  return [...actions].sort().join(",");
}

function backfillAllowedActionHashes(db: NonNullable<ReturnType<typeof getDb>>): void {
  try {
    const rows = db
      .prepare(
        `SELECT id, allowed_actions_json
         FROM aletheia_computer_operator_grants
         WHERE allowed_actions_hash IS NULL OR allowed_actions_hash = ''`,
      )
      .all() as Array<{ id: string; allowed_actions_json: string }>;
    const update = db.prepare(
      "UPDATE aletheia_computer_operator_grants SET allowed_actions_hash = ? WHERE id = ?",
    );
    for (const row of rows) {
      update.run(hashComputerOperatorAllowedActions(parseAllowedActions(row.allowed_actions_json)), row.id);
    }
  } catch (err) {
    console.error("[aletheiaComputerGrantStore] backfill hash error:", err);
  }
}

export function createComputerOperatorGrantsTable(): void {
  createAletheiaSessionsTable();
  const db = getDb();
  if (!db) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS aletheia_computer_operator_grants (
        id                   TEXT PRIMARY KEY,
        target_app           TEXT NOT NULL,
        allowed_actions_json TEXT NOT NULL,
        allowed_actions_hash TEXT,
        scope                TEXT NOT NULL,
        max_steps            INTEGER NOT NULL,
        declaration          TEXT NOT NULL,
        created_at           INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_aletheia_computer_operator_grants_app
        ON aletheia_computer_operator_grants (target_app, created_at DESC);
    `);
    try {
      db.exec(
        "ALTER TABLE aletheia_computer_operator_grants ADD COLUMN allowed_actions_hash TEXT",
      );
    } catch {
      /* column already exists */
    }
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_aletheia_computer_operator_grants_upsert
        ON aletheia_computer_operator_grants (target_app, scope, allowed_actions_hash);
    `);
    backfillAllowedActionHashes(db);
  } catch (err) {
    console.error("[aletheiaComputerGrantStore] create table error:", err);
  }
}

export function listComputerOperatorPersistentGrants(): ComputerOperatorPersistentGrantRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = db
      .prepare(
        `SELECT id, target_app, allowed_actions_json, scope, max_steps, declaration, created_at
         FROM aletheia_computer_operator_grants
         ORDER BY created_at DESC`,
      )
      .all() as Array<{
        id: string;
        target_app: string;
        allowed_actions_json: string;
        scope: string;
        max_steps: number;
        declaration: string;
        created_at: number;
      }>;
    return rows.map((row) => ({
      id: row.id,
      targetApp: row.target_app,
      allowedActions: parseAllowedActions(row.allowed_actions_json),
      scope: row.scope,
      maxSteps: row.max_steps,
      declaration: row.declaration,
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.error("[aletheiaComputerGrantStore] list error:", err);
    return [];
  }
}

export function saveComputerOperatorPersistentGrant(input: {
  targetApp: string;
  allowedActions: OperatorActionKind[];
  scope: string;
  maxSteps: number;
  declaration: string;
}): ComputerOperatorPersistentGrantRow {
  const db = getDb();
  const allowedActions = [...input.allowedActions];
  const allowedActionsHash = hashComputerOperatorAllowedActions(allowedActions);
  const row: ComputerOperatorPersistentGrantRow = {
    id: randomUUID(),
    targetApp: input.targetApp,
    allowedActions,
    scope: input.scope,
    maxSteps: input.maxSteps,
    declaration: input.declaration,
    createdAt: Date.now(),
  };
  if (!db) return row;
  try {
    db.prepare(
      `INSERT INTO aletheia_computer_operator_grants
       (id, target_app, allowed_actions_json, allowed_actions_hash, scope, max_steps, declaration, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(target_app, scope, allowed_actions_hash)
       DO UPDATE SET
         max_steps = excluded.max_steps,
         declaration = excluded.declaration,
         allowed_actions_json = excluded.allowed_actions_json,
         created_at = excluded.created_at`,
    ).run(
      row.id,
      row.targetApp,
      JSON.stringify(row.allowedActions),
      allowedActionsHash,
      row.scope,
      row.maxSteps,
      row.declaration,
      row.createdAt,
    );
    const existing = db
      .prepare(
        `SELECT id, created_at FROM aletheia_computer_operator_grants
         WHERE target_app = ? AND scope = ? AND allowed_actions_hash = ?`,
      )
      .get(row.targetApp, row.scope, allowedActionsHash) as
      | { id: string; created_at: number }
      | undefined;
    if (existing) {
      row.id = existing.id;
      row.createdAt = existing.created_at;
    }
  } catch (err) {
    console.error("[aletheiaComputerGrantStore] save error:", err);
  }
  return row;
}

export function revokeComputerOperatorPersistentGrant(grantId: string): boolean {
  const db = getDb();
  if (!db) return false;
  try {
    const result = db
      .prepare("DELETE FROM aletheia_computer_operator_grants WHERE id = ?")
      .run(grantId);
    return result.changes > 0;
  } catch (err) {
    console.error("[aletheiaComputerGrantStore] revoke error:", err);
    return false;
  }
}
