/**
 * Aletheia attention recovery (B4.3).
 *
 * After a meaningful gap (companion off or privacy pause), synthesize what
 * changed so Aletheia can speak a brief catch-up and show highlights in the dashboard.
 */

import type { AletheiaPersonaBehaviorSnapshot } from "./aletheiaPersonaBehavior.ts";
import { truncateAletheiaSpokenText } from "./aletheiaPersonaBehavior.ts";

export const ATTENTION_RECOVERY_MIN_GAP_MS = 5 * 60 * 1000;

export interface AletheiaAttentionRecoveryLedgerRow {
  summary: string;
  narration: string;
  ok: boolean | null;
  createdAt: number;
}

export interface AletheiaAttentionRecoveryInput {
  gapMs: number;
  now?: number;
  frontApp?: string;
  windowTitle?: string;
  lastSession?: {
    endedAt: number | null;
    turnCount: number;
    frontApp: string | null;
    summary: string | null;
  } | null;
  agentRun?: {
    agentId: string;
    status: string;
    updatedAt: number;
  } | null;
  pendingAdviceCount: number;
  ledgerEntries: readonly AletheiaAttentionRecoveryLedgerRow[];
  personaBehavior?: AletheiaPersonaBehaviorSnapshot | null;
}

export interface AletheiaAttentionRecoverySnapshot {
  gapMs: number;
  generatedAt: number;
  spokenBrief: string;
  highlights: string[];
}

function formatGapMinutes(gapMs: number): string {
  const minutes = Math.max(1, Math.round(gapMs / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function agentStatusLabel(agentId: string, status: string): string | null {
  if (status === "running") return `${agentId} agent is still running`;
  if (status === "done") return `${agentId} agent finished while you were away`;
  if (status === "error") return `${agentId} agent hit an error`;
  return null;
}

export function shouldRunAttentionRecovery(gapMs: number): boolean {
  return gapMs >= ATTENTION_RECOVERY_MIN_GAP_MS;
}

export function buildAletheiaAttentionRecovery(
  input: AletheiaAttentionRecoveryInput,
): AletheiaAttentionRecoverySnapshot | null {
  if (!shouldRunAttentionRecovery(input.gapMs)) return null;

  const now = input.now ?? Date.now();
  const highlights: string[] = [];
  const gapLabel = formatGapMinutes(input.gapMs);

  if (input.lastSession?.turnCount) {
    const app = input.lastSession.frontApp ? ` in ${input.lastSession.frontApp}` : "";
    highlights.push(`Last session: ${input.lastSession.turnCount} turn${input.lastSession.turnCount === 1 ? "" : "s"}${app}`);
    if (input.lastSession.summary?.trim()) {
      highlights.push(input.lastSession.summary.trim());
    }
  }

  if (input.agentRun && input.agentRun.updatedAt >= now - input.gapMs) {
    const agentLine = agentStatusLabel(input.agentRun.agentId, input.agentRun.status);
    if (agentLine) highlights.push(agentLine);
  }

  if (input.pendingAdviceCount > 0) {
    const summaryCoversAdvice =
      input.lastSession?.summary?.toLowerCase().includes("advice") === true;
    if (!summaryCoversAdvice) {
      highlights.push(
        `${input.pendingAdviceCount} pending advice card${input.pendingAdviceCount === 1 ? "" : "s"} waiting for you`,
      );
    }
  }

  const recentLedger = input.ledgerEntries
    .filter((row) => row.createdAt >= now - input.gapMs)
    .slice(0, 3);
  for (const row of recentLedger) {
    const status =
      row.ok === true ? "completed"
      : row.ok === false ? "failed"
      : "in progress";
    highlights.push(`${row.summary} (${status})`);
  }

  const screenLabel = input.frontApp?.trim() || input.windowTitle?.trim();
  if (screenLabel && screenLabel !== input.lastSession?.frontApp) {
    highlights.push(`You're now in ${screenLabel}`);
  }

  if (highlights.length === 0) {
    highlights.push(`Back after ${gapLabel} — ready when you are`);
  }

  const genericFallback = `Back after ${gapLabel} — ready when you are`;
  const spokenParts =
    highlights.length === 1 && highlights[0] === genericFallback
      ? [genericFallback]
      : [`Back after ${gapLabel}.`, highlights[0]!];
  if (input.pendingAdviceCount > 0 && !spokenParts[1]!.includes("advice")) {
    spokenParts.push("You have advice waiting.");
  }

  const spokenBrief = truncateAletheiaSpokenText(
    spokenParts.join(" "),
    input.personaBehavior ?? undefined,
  );

  return {
    gapMs: input.gapMs,
    generatedAt: now,
    spokenBrief,
    highlights: highlights.slice(0, 6),
  };
}
