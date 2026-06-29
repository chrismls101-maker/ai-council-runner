/** Shared memory types (main + renderer). */

export type MemoryRetrievalMode = "hybrid" | "fts_fallback" | "profile_only";

export function memoryRetrievalStatusLine(mode: MemoryRetrievalMode | undefined): string | undefined {
  if (mode === "fts_fallback") {
    return "Memory: using keyword fallback (semantic search unavailable).";
  }
  return undefined;
}

export interface HydratedContext {
  userProfile: string;
  relevantMemories: string;
  tokenCount: number;
  retrievalMode?: MemoryRetrievalMode;
}

export interface MemoryInput {
  sessionId?: string;
  agentId?: string;
  content: string;
  summary?: string;
  memoryType: string;
  importance?: number;
  provider?: string;
  tags?: string;
}

export interface MemoryHit {
  id: string;
  summary: string;
  content: string;
  score: number;
  distance?: number;
  memoryType: string;
  createdAt: number;
}

export interface ExtractedFact {
  key: string;
  value: string;
  confidence: number;
}
