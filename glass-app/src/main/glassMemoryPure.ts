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
