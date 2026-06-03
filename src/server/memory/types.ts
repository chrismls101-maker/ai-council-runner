export type MemoryType =
  | "project_fact"
  | "decision"
  | "outcome"
  | "preference"
  | "evidence";

export type MemoryMode = "off" | "auto" | "manual";

export type DecisionConfidence = "low" | "medium" | "high" | "unknown";
export type DecisionStatus = "active" | "revisited" | "changed" | "abandoned";
export type PreferenceScope = "global" | "project";
export type OutcomeStatus =
  | "not_started"
  | "in_progress"
  | "worked"
  | "did_not_work"
  | "needs_revision";

interface MemoryBase {
  id: string;
  type: MemoryType;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFactMemory extends MemoryBase {
  type: "project_fact";
  projectName: string;
  title: string;
  content: string;
  tags: string[];
}

export interface DecisionMemory extends MemoryBase {
  type: "decision";
  projectName: string;
  decision: string;
  reason: string;
  confidence: DecisionConfidence;
  relatedRunId?: string;
  status: DecisionStatus;
}

export interface OutcomeMemory extends MemoryBase {
  type: "outcome";
  projectName: string;
  relatedRunId?: string;
  outcomeStatus: OutcomeStatus;
  notes?: string;
  resultMetric?: string;
}

export interface PreferenceMemory extends MemoryBase {
  type: "preference";
  title: string;
  content: string;
  scope: PreferenceScope;
  projectName?: string;
}

export interface EvidenceMemory extends MemoryBase {
  type: "evidence";
  title: string;
  content: string;
  sourceUrl?: string;
  sourceType?: string;
  relatedRunId?: string;
  projectName?: string;
}

export type Memory =
  | ProjectFactMemory
  | DecisionMemory
  | OutcomeMemory
  | PreferenceMemory
  | EvidenceMemory;

export interface MemoryStoreFile {
  memories: Memory[];
}

export interface MemorySearchInput {
  query?: string;
  type?: MemoryType | "all";
  projectName?: string;
  limit?: number;
}

export interface RelevantMemoryInput {
  prompt: string;
  preset?: string;
  workflowName?: string;
  workflowId?: string;
  projectName?: string;
  selectedIds?: string[];
  limit?: number;
  includePresetInKeywords?: boolean;
}

export const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  project_fact: "Project Fact",
  decision: "Decision",
  outcome: "Outcome",
  preference: "Preference",
  evidence: "Evidence",
};
