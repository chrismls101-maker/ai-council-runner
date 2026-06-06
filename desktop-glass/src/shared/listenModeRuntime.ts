/**
 * Listen Mode — runtime state source of truth.
 *
 * Owns in-memory Listen session state: moments, surface timing, active card,
 * and queue. Main process holds one `ListenModeRuntime` instance; pure helpers
 * here keep reset/cleanup consistent across start-listening and Stop Everything.
 *
 * Card *decisions* live in listenCardState.ts; card *copy* in listenThoughtCards.ts.
 */

import {
  clearListenMomentEngineState,
  initialListenMomentEngineState,
  type ListenMomentEngineState,
} from "./listenMomentTypes.ts";

export type ListenModeRuntime = ListenMomentEngineState;

export function initialListenModeRuntime(): ListenModeRuntime {
  return initialListenMomentEngineState();
}

/** Full reset — Stop Everything, end session, mode off. */
export function clearListenModeRuntime(): ListenModeRuntime {
  return clearListenMomentEngineState();
}

/** Fresh Listen session — reset timer and one-card state; keep is optional. */
export function prepareListenModeSession(
  runtime: ListenModeRuntime,
  nowMs: number,
): ListenModeRuntime {
  return {
    ...runtime,
    listenStartedMs: nowMs,
    activeCardId: undefined,
    activeMomentId: undefined,
    queuedMomentIds: [],
  };
}

export function hasActiveListenCard(
  runtime: ListenModeRuntime,
  feedCardIds: Array<{ id: string; listenMomentId?: string }>,
): boolean {
  const id = runtime.activeCardId;
  if (!id) return false;
  return feedCardIds.some((f) => f.id === id && f.listenMomentId);
}
