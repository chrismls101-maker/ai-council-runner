import { shouldInjectContext } from "../contextRelevance/globalContextGuard.js";
import { memoryDisplayTitle } from "./formatMemoryContext.js";
import type { Memory, MemoryType, RelevantMemoryInput } from "./types.js";

const STOP_WORDS = new Set([
  "the", "a", "an", "for", "and", "or", "to", "in", "on", "at", "with",
  "my", "our", "i", "we", "need", "want", "help", "please", "can", "you",
  "me", "is", "are", "was", "be", "this", "that", "it", "of", "from", "should",
  "what", "how", "when", "after", "before", "now", "add", "find", "one",
]);

const TYPE_PRIORITY: Record<MemoryType, number> = {
  project_fact: 5,
  decision: 4,
  preference: 4,
  evidence: 3,
  outcome: 2,
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function memorySearchText(memory: Memory): string {
  const parts: string[] = [];
  switch (memory.type) {
    case "project_fact":
      parts.push(memory.projectName, memory.title, memory.content, ...memory.tags);
      break;
    case "decision":
      parts.push(memory.projectName, memory.decision, memory.reason, memory.status);
      break;
    case "outcome":
      parts.push(memory.projectName, memory.notes ?? "", memory.resultMetric ?? "", memory.outcomeStatus);
      break;
    case "preference":
      parts.push(memory.title, memory.content, memory.projectName ?? "", memory.scope);
      break;
    case "evidence":
      parts.push(memory.title, memory.content, memory.projectName ?? "", memory.sourceUrl ?? "", memory.sourceType ?? "");
      break;
  }
  return parts.join(" ").toLowerCase();
}

function scoreMemory(memory: Memory, keywords: string[], projectHint?: string): number {
  const haystack = memorySearchText(memory);
  let score = TYPE_PRIORITY[memory.type];

  for (const kw of keywords) {
    if (haystack.includes(kw)) score += 3;
  }

  if (projectHint) {
    const project = projectHint.toLowerCase();
    const memProject =
      memory.type === "preference" || memory.type === "evidence"
        ? memory.projectName?.toLowerCase()
        : memory.projectName.toLowerCase();
    if (memProject && (memProject.includes(project) || project.includes(memProject))) {
      score += 8;
    }
  }

  if (memory.type === "preference" && memory.scope === "global") score += 1;

  return score;
}

export function findRelevantMemories(
  memories: Memory[],
  input: RelevantMemoryInput,
): Memory[] {
  const limit = input.limit ?? 10;

  if (input.selectedIds?.length) {
    const selected = input.selectedIds
      .map((id) => memories.find((m) => m.id === id))
      .filter((m): m is Memory => Boolean(m));
    return selected.slice(0, limit);
  }

  const keywordSource = [
    input.prompt,
    input.includePresetInKeywords === false ? "" : input.preset,
    input.workflowName,
    input.workflowId,
    input.projectName,
  ]
    .filter(Boolean)
    .join(" ");

  const keywords = [...new Set(tokenize(keywordSource))];
  if (keywords.length === 0) return [];

  const projectHint =
    input.projectName ||
    (input.includePresetInKeywords === false
      ? undefined
      : input.preset === "ai-front-desk-sales-test"
        ? "AI Front Desk"
        : undefined);

  const ranked = memories
    .map((memory) => ({ memory, score: scoreMemory(memory, keywords, projectHint) }))
    .filter((item) => item.score >= 4)
    .sort((a, b) => b.score - a.score || b.memory.updatedAt.localeCompare(a.memory.updatedAt));

  const results: Memory[] = [];

  for (const { memory } of ranked) {
    if (results.length >= limit) break;
    if (memory.type === "outcome" && !keywords.some((k) => memorySearchText(memory).includes(k))) {
      continue;
    }

    const memProject =
      memory.type === "preference" || memory.type === "evidence"
        ? memory.projectName
        : "projectName" in memory
          ? memory.projectName
          : undefined;

    const guard = shouldInjectContext({
      userPrompt: input.prompt,
      workflowId: input.workflowId,
      contextType: "memory",
      contextTitle: memoryDisplayTitle(memory),
      contextBody: memorySearchText(memory),
      projectName: memProject ?? projectHint,
      presetId: input.includePresetInKeywords === false ? "none" : input.preset,
    });

    if (guard.allow) {
      results.push(memory);
    }
  }

  return results.slice(0, limit);
}

export function searchMemories(
  memories: Memory[],
  input: {
    query?: string;
    type?: MemoryType | "all";
    projectName?: string;
    limit?: number;
  },
): Memory[] {
  const limit = input.limit ?? 100;
  let filtered = [...memories];

  if (input.type && input.type !== "all") {
    filtered = filtered.filter((m) => m.type === input.type);
  }

  if (input.projectName?.trim()) {
    const project = input.projectName.trim().toLowerCase();
    filtered = filtered.filter((m) => {
      const memProject =
        m.type === "preference" ? m.projectName : "projectName" in m ? m.projectName : m.projectName;
      return memProject?.toLowerCase().includes(project);
    });
  }

  if (input.query?.trim()) {
    const q = input.query.trim().toLowerCase();
    filtered = filtered.filter((m) => memorySearchText(m).includes(q));
  }

  return filtered
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}
