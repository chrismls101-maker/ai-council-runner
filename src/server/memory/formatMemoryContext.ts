import { MEMORY_TYPE_LABELS, type Memory } from "./types.js";

function truncate(text: string, max = 220): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function memoryLine(memory: Memory): string {
  switch (memory.type) {
    case "project_fact":
      return `[${MEMORY_TYPE_LABELS.project_fact}] ${memory.projectName} — ${memory.title}: ${truncate(memory.content)}`;
    case "decision":
      return `[${MEMORY_TYPE_LABELS.decision}] ${memory.projectName} — ${truncate(memory.decision)}${memory.reason ? ` (Reason: ${truncate(memory.reason, 120)})` : ""}`;
    case "outcome":
      return `[${MEMORY_TYPE_LABELS.outcome}] ${memory.projectName} — ${memory.outcomeStatus.replace(/_/g, " ")}${memory.notes ? `: ${truncate(memory.notes, 120)}` : ""}`;
    case "preference":
      return `[${MEMORY_TYPE_LABELS.preference}] ${memory.title}: ${truncate(memory.content)}`;
    case "evidence":
      return `[${MEMORY_TYPE_LABELS.evidence}] ${memory.title}: ${truncate(memory.content)}${memory.sourceUrl ? ` (${memory.sourceUrl})` : ""}`;
    default:
      return "";
  }
}

export function formatMemoryContextBlock(memories: Memory[]): string {
  if (memories.length === 0) return "";
  return memories.map(memoryLine).filter(Boolean).join("\n");
}

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
      return memory.notes || memory.resultMetric || memory.outcomeStatus;
    case "preference":
      return memory.content;
    case "evidence":
      return memory.content;
    default:
      return "";
  }
}
