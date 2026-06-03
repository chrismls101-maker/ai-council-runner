import { formatMemoryContextBlock, memoryDisplayTitle } from "./formatMemoryContext.js";
import { findRelevantMemoriesApi } from "./memoryStore.js";
import {
  applyVisionMemoryGuard,
  type VisionMemoryGuardTrace,
  type VisionMemoryRunContext,
} from "./visionMemoryGuard.js";
import type { IncludedMemorySummary } from "../types/index.js";
import type { Memory, MemoryMode } from "./types.js";

export interface ResolvedMemoryContext {
  memories: Memory[];
  memoryBlock: string;
  includedMemoryIds: string[];
  includedMemories: IncludedMemorySummary[];
  visionMemoryGuard?: VisionMemoryGuardTrace;
}

function toSummary(memory: Memory): IncludedMemorySummary {
  const projectName =
    memory.type === "preference"
      ? memory.projectName
      : memory.type === "evidence"
        ? memory.projectName
        : "projectName" in memory
          ? memory.projectName
          : undefined;

  return {
    id: memory.id,
    type: memory.type,
    title: memoryDisplayTitle(memory),
    projectName,
  };
}

export async function resolveMemoryContext(options: {
  memoryMode?: MemoryMode;
  selectedMemoryIds?: string[];
  prompt: string;
  preset?: string;
  workflowName?: string;
  workflowId?: string;
  projectName?: string;
  includePresetInKeywords?: boolean;
  visionRun?: VisionMemoryRunContext | null;
}): Promise<ResolvedMemoryContext> {
  const mode = options.memoryMode ?? "auto";

  if (mode === "off") {
    return {
      memories: [],
      memoryBlock: "",
      includedMemoryIds: [],
      includedMemories: [],
    };
  }

  let memories =
    mode === "manual" && options.selectedMemoryIds?.length
      ? await findRelevantMemoriesApi({
          prompt: options.prompt,
          selectedIds: options.selectedMemoryIds,
        })
      : mode === "auto"
        ? await findRelevantMemoriesApi({
            prompt: options.prompt,
            preset: options.preset,
            workflowName: options.workflowName,
            workflowId: options.workflowId,
            projectName: options.projectName,
            includePresetInKeywords: options.includePresetInKeywords,
          })
        : [];

  let visionMemoryGuard: VisionMemoryGuardTrace | undefined;

  if (options.visionRun) {
    const guarded = applyVisionMemoryGuard(memories, options.visionRun);
    memories = guarded.memories;
    visionMemoryGuard = guarded.trace;
  }

  const memoryBlock = formatMemoryContextBlock(memories);
  const includedMemoryIds = memories.map((m) => m.id);
  const includedMemories = memories.map(toSummary);

  return {
    memories,
    memoryBlock,
    includedMemoryIds,
    includedMemories,
    visionMemoryGuard,
  };
}
