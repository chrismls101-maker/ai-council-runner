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
export type OutcomeMemoryStatus =
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
  outcomeStatus: OutcomeMemoryStatus;
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

export interface IncludedMemorySummary {
  id: string;
  type: MemoryType;
  title: string;
  projectName?: string;
}

export interface SaveMemoryDraft {
  type: MemoryType;
  projectName: string;
  title: string;
  content: string;
  tags: string;
  sourceUrl: string;
  sourceType?: string;
  relatedRunId: string;
  decision?: string;
  reason?: string;
  confidence?: DecisionConfidence;
  decisionStatus?: DecisionStatus;
}

export const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  project_fact: "Project Fact",
  decision: "Decision",
  outcome: "Outcome",
  preference: "Preference",
  evidence: "Evidence",
};

export const MEMORY_FILTER_OPTIONS: {
  value: MemoryType | "all";
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "project_fact", label: "Project Facts" },
  { value: "decision", label: "Decisions" },
  { value: "outcome", label: "Outcomes" },
  { value: "preference", label: "Preferences" },
  { value: "evidence", label: "Evidence" },
];

export const MEMORY_MODE_OPTIONS: { value: MemoryMode; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "No memory injected into this run" },
  {
    value: "auto",
    label: "Auto include relevant memory",
    hint: "Match project, keywords, and preset context",
  },
  {
    value: "manual",
    label: "Choose manually",
    hint: "Pick specific memories to include",
  },
];

export function memoryDisplayTitle(memory: Memory): string {
  switch (memory.type) {
    case "project_fact":
      return memory.title;
    case "decision":
      return memory.decision;
    case "outcome":
      return `${memory.projectName} outcome`;
    case "preference":
      return memory.title;
    case "evidence":
      return memory.title;
    default:
      return "Memory";
  }
}

export function memoryPreview(memory: Memory): string {
  switch (memory.type) {
    case "project_fact":
      return memory.content;
    case "decision":
      return memory.reason || memory.decision;
    case "outcome":
      return memory.notes || memory.resultMetric || memory.outcomeStatus.replace(/_/g, " ");
    case "preference":
      return memory.content;
    case "evidence":
      return memory.content;
    default:
      return "";
  }
}

export function memoryProjectName(memory: Memory): string | undefined {
  if (memory.type === "preference" || memory.type === "evidence") {
    return memory.projectName;
  }
  return memory.projectName;
}

export function contextLabelFromMemories(
  memories: IncludedMemorySummary[],
): string {
  if (memories.length === 0) return "";
  const projects = [
    ...new Set(memories.map((m) => m.projectName).filter(Boolean)),
  ] as string[];
  if (projects.length === 1) return projects[0];
  if (projects.length > 1) return "Mixed Context";
  return "Project Memory";
}

export const EMPTY_SAVE_DRAFT: SaveMemoryDraft = {
  type: "project_fact",
  projectName: "",
  title: "",
  content: "",
  tags: "",
  sourceUrl: "",
  relatedRunId: "",
  decision: "",
  reason: "",
  confidence: "medium",
  decisionStatus: "active",
};
