/** Shared memory types (main + renderer). */

export interface HydratedContext {
  userProfile: string;
  relevantMemories: string;
  tokenCount: number;
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
