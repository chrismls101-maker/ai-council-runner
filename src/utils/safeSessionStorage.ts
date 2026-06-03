import type { ConversationTurn } from "../types";
import {
  createArtifactSnapshot,
  estimateArtifactSizeBytes,
  INLINE_ARTIFACT_SNAPSHOT_MAX_BYTES,
  isArtifactReference,
} from "./artifactSnapshot.ts";

export type SessionSaveResult = {
  saved: boolean;
  compressed: boolean;
  pruned: boolean;
  warning?: string;
};

const MAX_THREAD_BYTES = 4 * 1024 * 1024;
const MAX_TURNS_AFTER_PRUNE = 12;

function estimatePayloadBytes(payload: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  } catch {
    return JSON.stringify(payload).length;
  }
}

function stripAllInlineArtifacts(turns: ConversationTurn[]): ConversationTurn[] {
  return turns.map((turn) => {
    const art = turn.artifact;
    if (!art) return turn;
    const snapshot = createArtifactSnapshot(art, turn.runId);
    return {
      ...turn,
      artifact: undefined,
      artifactSnapshot: snapshot,
    };
  });
}

function pruneOldestTurns(turns: ConversationTurn[], keep: number): ConversationTurn[] {
  if (turns.length <= keep) return turns;
  return turns.slice(turns.length - keep);
}

export function prepareTurnsForSessionSave(turns: ConversationTurn[]): {
  turns: ConversationTurn[];
  compressed: boolean;
} {
  let compressed = false;
  let prepared = turns.map((turn) => {
    const art = turn.artifact;
    if (!art) return turn;
    if (
      turn.artifactSnapshot &&
      (turn.artifactSnapshot.mode === "reference" || isArtifactReference(turn.artifactSnapshot))
    ) {
      return { ...turn, artifact: undefined };
    }
    if (art.renderMode === "canvas" || estimateArtifactSizeBytes(art) > INLINE_ARTIFACT_SNAPSHOT_MAX_BYTES) {
      compressed = true;
      const snapshot = createArtifactSnapshot(art, turn.runId);
      return { ...turn, artifact: undefined, artifactSnapshot: snapshot };
    }
    const snapshot = createArtifactSnapshot(art, turn.runId);
    return { ...turn, artifactSnapshot: snapshot, artifact: snapshot.mode === "inline" ? art : undefined };
  });

  let bytes = estimatePayloadBytes(prepared);
  if (bytes > MAX_THREAD_BYTES) {
    compressed = true;
    prepared = stripAllInlineArtifacts(prepared);
    bytes = estimatePayloadBytes(prepared);
  }
  if (bytes > MAX_THREAD_BYTES) {
    compressed = true;
    prepared = pruneOldestTurns(prepared, MAX_TURNS_AFTER_PRUNE);
  }

  return { turns: prepared, compressed };
}

export function safeSaveConversationThread(
  key: string,
  turns: ConversationTurn[],
): SessionSaveResult {
  if (turns.length === 0) {
    try {
      sessionStorage.removeItem(key);
      return { saved: true, compressed: false, pruned: false };
    } catch {
      return { saved: false, compressed: false, pruned: false, warning: "Could not clear session." };
    }
  }

  let { turns: prepared, compressed } = prepareTurnsForSessionSave(turns);
  let pruned = false;

  const trySave = (payload: ConversationTurn[]): boolean => {
    try {
      sessionStorage.setItem(key, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  };

  if (trySave(prepared)) {
    return {
      saved: true,
      compressed,
      pruned,
      warning: compressed
        ? "Session snapshot compressed: artifact references used."
        : undefined,
    };
  }

  compressed = true;
  prepared = stripAllInlineArtifacts(prepared);
  if (trySave(prepared)) {
    return {
      saved: true,
      compressed: true,
      pruned: false,
      warning: "Session snapshot compressed: artifact references used.",
    };
  }

  pruned = true;
  prepared = pruneOldestTurns(prepared, MAX_TURNS_AFTER_PRUNE);
  if (trySave(prepared)) {
    return {
      saved: true,
      compressed: true,
      pruned: true,
      warning: "Session snapshot exceeded quota; oldest turns pruned.",
    };
  }

  return {
    saved: false,
    compressed: true,
    pruned: true,
    warning: "Could not save conversation thread — storage full.",
  };
}
