/**
 * Agent run persistence — council steps keyed by correlation_id.
 */

import { getDb, type AgentRunRow, type AgentRunStatus } from "./glassDatabase.ts";

const COUNCIL_AGENT_IDS = ["strategy", "critic", "judge"] as const;

const RUN_ORDER: Record<string, number> = {
  strategy: 0,
  critic: 1,
  judge: 2,
};

export interface UpsertAgentRunOpts {
  id: string;
  sessionId: string;
  agentId: string;
  runOrder: number;
  status: AgentRunStatus;
  correlationId: string;
  input?: string;
  output?: string;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export function agentRunId(correlationId: string, agentId: string): string {
  return `${correlationId}:${agentId}`;
}

export function runOrderForAgent(agentId: string): number {
  return RUN_ORDER[agentId] ?? 0;
}

export function upsertAgentRun(opts: UpsertAgentRunOpts): void {
  const db = getDb();
  if (!db) return;
  db.prepare(
    `INSERT OR REPLACE INTO agent_runs (
      id, session_id, agent_id, run_order, status, input, output,
      started_at, completed_at, error, correlation_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.id,
    opts.sessionId,
    opts.agentId,
    opts.runOrder,
    opts.status,
    opts.input ?? null,
    opts.output ?? null,
    opts.startedAt ?? null,
    opts.completedAt ?? null,
    opts.error ?? null,
    opts.correlationId,
  );
}

export function getAgentRunsBySessionId(sessionId: string): AgentRunRow[] {
  const db = getDb();
  if (!db) return [];
  return db
    .prepare(
      `SELECT id, session_id, agent_id, run_order, status, input, output,
              started_at, completed_at, error, correlation_id
       FROM agent_runs WHERE session_id = ? ORDER BY run_order ASC, completed_at ASC`,
    )
    .all(sessionId) as AgentRunRow[];
}

export function getLatestCorrelationAgentRuns(sessionId: string): AgentRunRow[] {
  const all = getAgentRunsBySessionId(sessionId);
  if (!all.length) return [];
  let latestCorrelationId = all[0]!.correlation_id;
  let latestTime = all[0]!.completed_at ?? all[0]!.started_at ?? 0;
  for (const run of all) {
    const time = run.completed_at ?? run.started_at ?? 0;
    if (time >= latestTime) {
      latestTime = time;
      latestCorrelationId = run.correlation_id;
    }
  }
  return all
    .filter((run) => run.correlation_id === latestCorrelationId)
    .sort((a, b) => a.run_order - b.run_order || (a.completed_at ?? 0) - (b.completed_at ?? 0));
}

export function getAgentRunsByCorrelation(correlationId: string): AgentRunRow[] {
  const db = getDb();
  if (!db) return [];
  return db
    .prepare(
      `SELECT id, session_id, agent_id, run_order, status, input, output,
              started_at, completed_at, error, correlation_id
       FROM agent_runs WHERE correlation_id = ? ORDER BY run_order ASC`,
    )
    .all(correlationId) as AgentRunRow[];
}

export function getLastCouncilRun(): AgentRunRow[] | null {
  const db = getDb();
  if (!db) return null;
  const latest = db
    .prepare(
      `SELECT correlation_id FROM agent_runs
       WHERE agent_id IN ('strategy', 'critic', 'judge')
       ORDER BY COALESCE(completed_at, started_at, 0) DESC
       LIMIT 1`,
    )
    .get() as { correlation_id: string } | undefined;
  if (!latest?.correlation_id) return null;
  const rows = getAgentRunsByCorrelation(latest.correlation_id);
  return rows.length > 0 ? rows : null;
}

export { COUNCIL_AGENT_IDS };
