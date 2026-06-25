/**
 * Glass Retention Events — local-only instrumentation.
 *
 * Logs behavioral events to retention_events (SQLite, V5 migration).
 * No external analytics — all data stays on device.
 *
 * Events tracked:
 *   glass_session_start        — user opens Glass
 *   glass_session_end          — user closes Glass
 *   workflow_triggered         — any named workflow fires
 *   terminal_autofix_shown     — autofix card shown to user
 *   terminal_autofix_accepted  — user clicked Accept on autofix
 *   terminal_autofix_dismissed — user dismissed autofix card
 *   build_loop_started         — Glass Coder build loop begins
 *   build_loop_completed       — Glass Coder build loop finishes
 *   memory_enrichment_used     — memory retrieval contributed to a response
 *   agent_chain_fired          — an agent chain subscription ran
 */

import { randomUUID } from "crypto";
import type { RetentionSummary } from "../shared/ipc.ts";
import { getDb } from "./glassDatabase.ts";

export type { RetentionSummary };

// ─── Core insert ────────────────────────────────────────────────────────────

export function logRetentionEvent(
  eventName: string,
  sessionId?: string | null,
  meta?: Record<string, unknown> | null,
): void {
  const db = getDb();
  if (!db) return;
  try {
    db.prepare(
      `INSERT INTO retention_events (id, event_name, session_id, created_at, meta)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      eventName,
      sessionId ?? null,
      Date.now(),
      meta ? JSON.stringify(meta) : null,
    );
  } catch (err) {
    console.error("[glassRetention] logRetentionEvent failed:", eventName, err);
  }
}

// ─── Typed helpers ───────────────────────────────────────────────────────────

export function logSessionStart(sessionId?: string): void {
  logRetentionEvent("glass_session_start", sessionId);
}

export function logSessionEnd(sessionId?: string, meta?: { durationMs?: number }): void {
  logRetentionEvent("glass_session_end", sessionId, meta ?? null);
}

export function logWorkflowTriggered(
  workflowName: string,
  sessionId?: string,
  meta?: Record<string, unknown>,
): void {
  logRetentionEvent("workflow_triggered", sessionId, { workflow: workflowName, ...meta });
}

export function logTerminalAutofixShown(sessionId?: string): void {
  logRetentionEvent("terminal_autofix_shown", sessionId);
}

export function logTerminalAutofixAccepted(sessionId?: string): void {
  logRetentionEvent("terminal_autofix_accepted", sessionId);
}

export function logTerminalAutofixDismissed(sessionId?: string): void {
  logRetentionEvent("terminal_autofix_dismissed", sessionId);
}

export function logBuildLoopStarted(
  sessionId?: string,
  meta?: { agentRunId?: string; prompt?: string },
): void {
  logRetentionEvent("build_loop_started", sessionId, meta ?? null);
}

export function logBuildLoopCompleted(
  sessionId?: string,
  meta?: { agentRunId?: string; iterations?: number; success?: boolean },
): void {
  logRetentionEvent("build_loop_completed", sessionId, meta ?? null);
}

export function logMemoryEnrichmentUsed(sessionId?: string, meta?: { memoryCount?: number }): void {
  logRetentionEvent("memory_enrichment_used", sessionId, meta ?? null);
}

export function logAgentChainFired(
  chainName: string,
  sessionId?: string,
  meta?: Record<string, unknown>,
): void {
  logRetentionEvent("agent_chain_fired", sessionId, { chain: chainName, ...meta });
}

// ─── Query helper ─────────────────────────────────────────────────────────────

export function getRetentionSummary(): RetentionSummary {
  const db = getDb();
  if (!db) {
    return {
      sessionsLast7Days: 0,
      workflowsPerSession: 0,
      autofixAcceptanceRate: 0,
      buildLoopSuccessRate: 0,
    };
  }

  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const countEvent = (eventName: string): number => {
    const row = db
      .prepare(
        "SELECT COUNT(*) as n FROM retention_events WHERE event_name = ? AND created_at >= ?",
      )
      .get(eventName, cutoff) as { n: number };
    return row?.n ?? 0;
  };

  const sessionsLast7Days = countEvent("glass_session_start");
  const workflowsTotal = countEvent("workflow_triggered");
  const autofixShown = countEvent("terminal_autofix_shown");
  const autofixAccepted = countEvent("terminal_autofix_accepted");
  const buildLoopStarted = countEvent("build_loop_started");
  const buildLoopCompleted = countEvent("build_loop_completed");

  // workflows per session (avoid divide-by-zero)
  const workflowsPerSession =
    sessionsLast7Days > 0 ? Math.round((workflowsTotal / sessionsLast7Days) * 10) / 10 : 0;

  // autofix acceptance rate 0-1
  const autofixAcceptanceRate =
    autofixShown > 0 ? Math.round((autofixAccepted / autofixShown) * 100) / 100 : 0;

  // build loop success: completed rows with success=true in meta
  let buildLoopSucceeded = 0;
  if (buildLoopStarted > 0) {
    const rows = db
      .prepare(
        "SELECT meta FROM retention_events WHERE event_name = 'build_loop_completed' AND created_at >= ?",
      )
      .all(cutoff) as Array<{ meta: string | null }>;
    buildLoopSucceeded = rows.filter((r) => {
      try {
        const m = r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : null;
        return m?.success === true;
      } catch {
        return false;
      }
    }).length;
  }

  const buildLoopSuccessRate =
    buildLoopCompleted > 0
      ? Math.round((buildLoopSucceeded / buildLoopCompleted) * 100) / 100
      : 0;

  return {
    sessionsLast7Days,
    workflowsPerSession,
    autofixAcceptanceRate,
    buildLoopSuccessRate,
  };
}
