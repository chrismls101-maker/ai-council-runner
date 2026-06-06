/**
 * Listen mode — one active insight card at a time.
 *
 * Pure — no electron / fs.
 */

import { isDuplicateText } from "./sessionIntelligence.ts";
import type { ListenMoment } from "./listenMomentTypes.ts";

export interface ListenCardRuntimeState {
  activeCardId?: string;
  activeMomentId?: string;
  queuedMomentIds: string[];
}

export function initialListenCardRuntimeState(): ListenCardRuntimeState {
  return { queuedMomentIds: [] };
}

export function clearListenCardRuntimeState(): ListenCardRuntimeState {
  return initialListenCardRuntimeState();
}

export type ListenCardSurfaceDecision =
  | "surface_new"
  | "update_existing"
  | "save_silently"
  | "queue_silent";

export interface ListenCardSurfaceInput {
  runtime: ListenCardRuntimeState;
  moment: ListenMoment;
  hasVisibleListenCard: boolean;
  activeMoment?: ListenMoment;
}

function momentsRelated(a: ListenMoment, b: ListenMoment): boolean {
  if (a.type === b.type) return true;
  const anchorA = a.transcriptAnchors[0] ?? a.summary;
  const anchorB = b.transcriptAnchors[0] ?? b.summary;
  if (anchorA.length > 20 && anchorB.length > 20 && isDuplicateText(anchorA, anchorB)) return true;
  return false;
}

/** Decide whether to surface, update, or silently save when a card may already be visible. */
export function decideListenCardSurface(input: ListenCardSurfaceInput): ListenCardSurfaceDecision {
  const { runtime, moment, hasVisibleListenCard } = input;

  if (!hasVisibleListenCard && !runtime.activeCardId) {
    return "surface_new";
  }

  if (runtime.activeMomentId === moment.id) {
    return "update_existing";
  }

  if (input.activeMoment && momentsRelated(moment, input.activeMoment)) {
    return "update_existing";
  }

  return "save_silently";
}

export function applyListenCardSurface(
  runtime: ListenCardRuntimeState,
  decision: ListenCardSurfaceDecision,
  cardId: string,
  momentId: string,
): ListenCardRuntimeState {
  if (decision === "surface_new" || decision === "update_existing") {
    return {
      activeCardId: cardId,
      activeMomentId: momentId,
      queuedMomentIds: runtime.queuedMomentIds.filter((id) => id !== momentId),
    };
  }
  if (decision === "save_silently" || decision === "queue_silent") {
    const queued = runtime.queuedMomentIds.includes(momentId)
      ? runtime.queuedMomentIds
      : [...runtime.queuedMomentIds, momentId].slice(-20);
    return { ...runtime, queuedMomentIds: queued };
  }
  return runtime;
}

/** Overlay should show at most one listen insight card. */
export function filterFeedToSingleListenCard<T extends { listenMomentId?: string; kind: string }>(
  items: T[],
): T[] {
  let listenSeen = false;
  const filtered: T[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.listenMomentId && item.kind === "response") {
      if (listenSeen) continue;
      listenSeen = true;
    }
    filtered.unshift(item);
  }
  return filtered;
}
