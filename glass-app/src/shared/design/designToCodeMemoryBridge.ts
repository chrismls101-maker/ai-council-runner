import type { AletheiaNote } from "../aletheiaNotes.ts";
import type { GlassProjectRecord } from "../glassStorageProjectTypes.ts";
import type { DesignStack, DesignToCodeAction, DesignToCodeSession } from "./designToCodeTypes.ts";
import {
  evaluateDesignToCodeMemoryIngestion,
  type DesignToCodeMemoryEvent,
} from "./designToCodeMemoryIngestion.ts";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TAG_DEDUPE_MS = 7 * 24 * 60 * 60 * 1000;

export function projectSnapshotsFromRecords(
  records: readonly GlassProjectRecord[],
): import("./designToCodeMemoryIngestion.ts").DesignToCodeProjectSnapshot[] {
  return records
    .filter((r) => r.kind === "design-to-code")
    .map((r) => ({
      stack: r.stack,
      action: r.action,
      status: r.status,
      updatedAt: r.updatedAt,
      revisionCount: r.revisionCount,
    }));
}

export function countRecentDesignToCodeGenerationFailureNotes(
  notes: readonly AletheiaNote[],
  now = Date.now(),
): number {
  return notes.filter(
    (n) =>
      n.body.startsWith("Design to Code:")
      && n.body.includes("generation failed")
      && now - n.updatedAt <= SEVEN_DAYS_MS,
  ).length;
}

export { evaluateDesignToCodeMemoryIngestion, isExplicitDesignToCodeRememberText } from "./designToCodeMemoryIngestion.ts";

export type ApplyDesignToCodeMemoryDeps = {
  hasRecentMemoryTag: (tag: string, sinceMs: number) => boolean;
  storeMemory: (input: {
    sessionId?: string;
    agentId?: string;
    content: string;
    summary?: string;
    memoryType: string;
    importance?: number;
    provider?: string;
    tags?: string;
  }) => Promise<void>;
  upsertUserContext: (fact: { key: string; value: string; confidence: number }) => void;
};

export async function applyDesignToCodeMemoryIngestion(input: {
  event: DesignToCodeMemoryEvent;
  session?: DesignToCodeSession;
  stack: DesignStack;
  action: DesignToCodeAction;
  error?: string;
  projects: readonly GlassProjectRecord[];
  notes?: readonly AletheiaNote[];
  explicitRememberText?: string;
  sessionId?: string;
  deps: ApplyDesignToCodeMemoryDeps;
  now?: number;
}): Promise<number> {
  const now = input.now ?? Date.now();
  const decisions = evaluateDesignToCodeMemoryIngestion({
    event: input.event,
    stack: input.stack,
    action: input.action,
    error: input.error,
    projects: projectSnapshotsFromRecords(input.projects),
    recentGenerationFailureNotes: input.notes
      ? countRecentDesignToCodeGenerationFailureNotes(input.notes, now)
      : 0,
    explicitRememberText: input.explicitRememberText,
    now,
  });

  let stored = 0;
  for (const decision of decisions) {
    if (decision.kind === "preference") {
      input.deps.upsertUserContext({
        key: decision.key,
        value: decision.value,
        confidence: decision.confidence,
      });
      stored += 1;
      continue;
    }

    if (input.deps.hasRecentMemoryTag(decision.tag, now - TAG_DEDUPE_MS)) {
      continue;
    }

    await input.deps.storeMemory({
      sessionId: input.sessionId,
      agentId: "design-to-code",
      content: decision.content,
      summary: decision.summary,
      memoryType: decision.memoryType,
      importance: decision.importance,
      provider: "design-to-code",
      tags: decision.tag,
    });
    stored += 1;
  }

  return stored;
}
