/**
 * Cross-run context produced by agent chains (e.g. Research fix for next Coder run).
 */

const RESEARCH_FIX_TTL_MS = 30 * 60 * 1000;
const MAX_EXCERPT_CHARS = 6_000;

interface PendingResearchFix {
  excerpt: string;
  outputPath?: string;
  correlationId: string;
  at: number;
}

let pendingBySession = new Map<string, PendingResearchFix>();

export function storeChainResearchFix(
  sessionId: string,
  excerpt: string,
  correlationId: string,
  outputPath?: string,
): void {
  const trimmed = excerpt.trim();
  if (!trimmed) return;
  pendingBySession.set(sessionId, {
    excerpt: trimmed.slice(0, MAX_EXCERPT_CHARS),
    outputPath,
    correlationId,
    at: Date.now(),
  });
}

/** Consume and return research bootstrap text for the next Coder run in this session. */
export function consumeChainResearchBootstrap(sessionId: string): string | undefined {
  pruneExpired();
  const entry = pendingBySession.get(sessionId);
  if (!entry) return undefined;
  pendingBySession.delete(sessionId);
  const pathLine = entry.outputPath ? `\nReport saved at: ${entry.outputPath}` : "";
  return [
    "Prior automated research (from a Coder error chain):",
    entry.excerpt,
    pathLine,
  ].filter(Boolean).join("\n");
}

export function clearChainResearchContext(): void {
  pendingBySession.clear();
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [sessionId, entry] of pendingBySession) {
    if (now - entry.at > RESEARCH_FIX_TTL_MS) {
      pendingBySession.delete(sessionId);
    }
  }
}

/** Test helper */
export function pendingChainResearchSessionCount(): number {
  pruneExpired();
  return pendingBySession.size;
}
