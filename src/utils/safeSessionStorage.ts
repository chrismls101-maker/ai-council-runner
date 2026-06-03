import type { ConversationTurn } from "../types";

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

function pruneOldestTurns(turns: ConversationTurn[], keep: number): ConversationTurn[] {
  if (turns.length <= keep) return turns;
  return turns.slice(turns.length - keep);
}

export function prepareTurnsForSessionSave(turns: ConversationTurn[]): {
  turns: ConversationTurn[];
  compressed: boolean;
} {
  let prepared = turns.map((turn) => ({ ...turn }));
  let compressed = false;

  let bytes = estimatePayloadBytes(prepared);
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
    return { saved: true, compressed, pruned };
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
