/**
 * Aletheia trust narrative (B6) — human-legible activity from the action ledger.
 *
 * Glass owns the durable ledger; Aletheia dashboard surfaces a live, readable trail.
 */

import type { ActionKind, ActionLedgerEntry, PipelineStage } from "./aletheiaExecution.ts";
import { FOUNDER_COMMAND_LEDGER_ATTRIBUTION } from "./aletheiaFounderCommandTier.ts";

export interface AletheiaTrustActivityRow {
  id: string;
  intentId: string;
  createdAt: number;
  stage: PipelineStage;
  kind: ActionKind;
  /** One-line human summary for the trust panel. */
  headline: string;
  /** Optional second line — scope, method, or error detail. */
  detail?: string;
  ok: boolean | null;
  /** B8 — ledger attribution when tagged (e.g. founder command session). */
  attributionLabel?: string;
}

export interface AletheiaTrustActivitySnapshot {
  updatedAt: number;
  /** Rows newest-first for the live activity feed. */
  entries: AletheiaTrustActivityRow[];
  /** Companion session filter when active. */
  sessionId?: string;
  totalInView: number;
  successCount: number;
  failureCount: number;
  /** Short status line for dashboard header copy. */
  summaryLine: string;
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  intent: "Received",
  planning: "Planned",
  "awaiting-confirmation": "Awaiting approval",
  executing: "Running",
  verifying: "Verifying",
  complete: "Completed",
  failed: "Failed",
  "rolled-back": "Rolled back",
};

const KIND_LABELS: Record<ActionKind, string> = {
  shell: "Terminal",
  "file-write": "File write",
  "file-apply": "Apply diff",
  keystroke: "Type text",
  "app-control": "App control",
  research: "Research",
  delegated: "Delegated task",
};

export function stageLabel(stage: PipelineStage): string {
  return STAGE_LABELS[stage] ?? stage;
}

export function kindLabel(kind: ActionKind): string {
  return KIND_LABELS[kind] ?? kind;
}

export function formatTrustLedgerHeadline(entry: ActionLedgerEntry): string {
  const stage = stageLabel(entry.stage);
  const kind = kindLabel(entry.kind);
  const narration = entry.narration?.trim();
  if (narration && narration.length <= 160) {
    return narration;
  }
  if (entry.stage === "complete" && entry.ok) {
    return `${stage}: ${entry.summary}`;
  }
  if (entry.stage === "failed" || entry.ok === false) {
    return `${stage} — ${entry.errorMessage?.trim() || entry.summary}`;
  }
  return `${stage} · ${kind} — ${entry.summary}`;
}

export function ledgerAttributionLabel(attribution?: string | null): string | undefined {
  if (!attribution) return undefined;
  if (attribution === FOUNDER_COMMAND_LEDGER_ATTRIBUTION) {
    return "Founder command session";
  }
  return attribution;
}

export function formatTrustLedgerDetail(entry: ActionLedgerEntry): string | undefined {
  if (entry.errorMessage?.trim() && !formatTrustLedgerHeadline(entry).includes(entry.errorMessage.trim())) {
    return entry.errorMessage.trim();
  }
  const narration = entry.narration?.trim();
  const headline = formatTrustLedgerHeadline(entry);
  if (narration && narration !== headline && narration.length <= 320) {
    return narration;
  }
  return `${kindLabel(entry.kind)} · ${stageLabel(entry.stage)}`;
}

export function ledgerRowFromEntry(entry: ActionLedgerEntry): AletheiaTrustActivityRow {
  return {
    id: entry.id,
    intentId: entry.intentId,
    createdAt: entry.createdAt,
    stage: entry.stage,
    kind: entry.kind,
    headline: formatTrustLedgerHeadline(entry),
    detail: formatTrustLedgerDetail(entry),
    ok: entry.ok,
    attributionLabel: ledgerAttributionLabel(entry.attribution),
  };
}

export function buildAletheiaTrustActivity(
  entries: readonly ActionLedgerEntry[],
  options?: { sessionId?: string; limit?: number },
): AletheiaTrustActivitySnapshot {
  const limit = options?.limit ?? 24;
  const sessionId = options?.sessionId?.trim() || undefined;
  let filtered = [...entries];
  if (sessionId) {
    filtered = filtered.filter((row) => row.sessionId === sessionId);
  }
  filtered.sort((a, b) => b.createdAt - a.createdAt);
  const slice = filtered.slice(0, limit);
  const rows = slice.map(ledgerRowFromEntry);

  const successCount = rows.filter((row) => row.ok === true).length;
  const failureCount = rows.filter((row) => row.ok === false).length;

  let summaryLine = "No Aletheia actions recorded yet.";
  if (rows.length > 0) {
    if (failureCount === 0) {
      summaryLine = `${rows.length} recent step${rows.length === 1 ? "" : "s"} — all successful in view.`;
    } else {
      summaryLine = `${rows.length} recent step${rows.length === 1 ? "" : "s"} · ${failureCount} need${failureCount === 1 ? "s" : ""} attention.`;
    }
  }

  return {
    updatedAt: Date.now(),
    sessionId,
    entries: rows,
    totalInView: rows.length,
    successCount,
    failureCount,
    summaryLine,
  };
}

export function trustActivitySnapshotsEqual(
  a: AletheiaTrustActivitySnapshot | undefined,
  b: AletheiaTrustActivitySnapshot | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.totalInView !== b.totalInView || a.successCount !== b.successCount) return false;
  if (a.entries.length !== b.entries.length) return false;
  return a.entries.every((row, index) => row.id === b.entries[index]?.id);
}
