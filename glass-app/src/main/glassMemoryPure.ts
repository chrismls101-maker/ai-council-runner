/**
 * Pure memory helpers (no Electron / DB imports) — safe for unit tests.
 */

import { randomUUID } from "crypto";

const EXTRACTION_DEDUPE_MS = 2 * 60 * 1000;

export function resolveAgentSessionId(sessionId?: string): string {
  if (!sessionId || sessionId === "default") {
    return `agent-${randomUUID()}`;
  }
  return sessionId;
}

export function extractionDedupeKey(sessionId: string, correlationId?: string): string {
  return correlationId ? `extraction:${correlationId}` : `extraction:session:${sessionId}`;
}

export function shouldSkipRecentExtraction(
  sessionId: string,
  correlationId: string | undefined,
  hasRecentMemory: (tag: string, sinceMs: number) => boolean,
): boolean {
  const tag = extractionDedupeKey(sessionId, correlationId);
  return hasRecentMemory(tag, Date.now() - EXTRACTION_DEDUPE_MS);
}

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Select memory summaries that fit within a token budget (lower score = higher rank). */
export function selectMemoryHitsWithinBudget<T extends { summary: string; score: number }>(
  hits: T[],
  budgetTokens: number,
): { selected: T[]; summaries: string[] } {
  const sorted = [...hits].sort((a, b) => a.score - b.score);
  const selected: T[] = [];
  const summaries: string[] = [];
  let remaining = budgetTokens;

  for (const hit of sorted) {
    const line = hit.summary.trim();
    if (!line) continue;
    const lineTokens = approxTokens(line);
    if (lineTokens > remaining) continue;
    selected.push(hit);
    summaries.push(line);
    remaining -= lineTokens;
    if (remaining <= 0) break;
  }

  return { selected, summaries };
}
