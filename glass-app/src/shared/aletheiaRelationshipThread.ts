/**
 * Aletheia relationship thread (B5.1) — continuous companion awareness across app switches.
 *
 * Queues significant events while the user is away from their work context and
 * synthesizes a human-readable return brief when they come back.
 */

import { randomUUID } from "node:crypto";

export type RelationshipEventKind =
  | "app_switch"
  | "terminal_error"
  | "screen_context_change"
  | "sidecar_degraded";

export interface AletheiaRelationshipEvent {
  id: string;
  kind: RelationshipEventKind;
  summary: string;
  detail?: string;
  createdAt: number;
}

export interface AletheiaRelationshipThreadSnapshot {
  updatedAt: number;
  events: AletheiaRelationshipEvent[];
  /** Work anchor for this companion session. */
  focusApp?: string;
  /** App the user switched to when they left focus. */
  awayApp?: string;
  awaySince?: number;
  lastReturnBrief?: string;
  lastReturnBriefAt?: number;
}

export const RELATIONSHIP_EVENT_MAX_AGE_MS = 45 * 60 * 1000;
export const RELATIONSHIP_EVENT_LIMIT = 24;
export const RELATIONSHIP_AWAY_MIN_MS = 8_000;

export function emptyAletheiaRelationshipThread(now = Date.now()): AletheiaRelationshipThreadSnapshot {
  return { updatedAt: now, events: [] };
}

export function appendRelationshipEvent(
  snapshot: AletheiaRelationshipThreadSnapshot | undefined,
  input: {
    kind: RelationshipEventKind;
    summary: string;
    detail?: string;
    now?: number;
  },
): AletheiaRelationshipThreadSnapshot {
  const now = input.now ?? Date.now();
  const base = snapshot ?? emptyAletheiaRelationshipThread(now);
  const event: AletheiaRelationshipEvent = {
    id: randomUUID(),
    kind: input.kind,
    summary: input.summary.trim(),
    detail: input.detail?.trim() || undefined,
    createdAt: now,
  };

  const events = pruneRelationshipEvents([event, ...base.events], now);
  return { ...base, events, updatedAt: now };
}

export function pruneRelationshipEvents(
  events: readonly AletheiaRelationshipEvent[],
  now = Date.now(),
): AletheiaRelationshipEvent[] {
  const cutoff = now - RELATIONSHIP_EVENT_MAX_AGE_MS;
  return events
    .filter((event) => event.createdAt >= cutoff)
    .slice(0, RELATIONSHIP_EVENT_LIMIT);
}

export function markCompanionAway(
  snapshot: AletheiaRelationshipThreadSnapshot,
  awayApp: string,
  now = Date.now(),
): AletheiaRelationshipThreadSnapshot {
  if (snapshot.awayApp === awayApp) {
    return { ...snapshot, updatedAt: now };
  }
  return {
    ...snapshot,
    awayApp,
    awaySince: now,
    updatedAt: now,
  };
}

export function clearCompanionAway(
  snapshot: AletheiaRelationshipThreadSnapshot,
  now = Date.now(),
): AletheiaRelationshipThreadSnapshot {
  return {
    ...snapshot,
    awayApp: undefined,
    awaySince: undefined,
    updatedAt: now,
  };
}

function eventsSinceAway(
  snapshot: AletheiaRelationshipThreadSnapshot,
  awaySince: number,
): AletheiaRelationshipEvent[] {
  return snapshot.events.filter((event) => event.createdAt >= awaySince);
}

export function buildRelationshipReturnBrief(
  snapshot: AletheiaRelationshipThreadSnapshot,
  returnedToApp: string,
  now = Date.now(),
): { brief: string; snapshot: AletheiaRelationshipThreadSnapshot } | null {
  const awayApp = snapshot.awayApp?.trim();
  const awaySince = snapshot.awaySince;
  if (!awayApp || awaySince == null) return null;
  if (now - awaySince < RELATIONSHIP_AWAY_MIN_MS) return null;
  if (returnedToApp.trim() === awayApp) return null;

  const relevant = eventsSinceAway(snapshot, awaySince).filter(
    (event) => event.kind !== "app_switch" || !event.summary.startsWith("Switched to"),
  );
  const awayMs = now - awaySince;
  const awayMinutes = Math.max(1, Math.round(awayMs / 60_000));

  const lines: string[] = [];
  if (relevant.length === 0) {
    lines.push(`You were in ${awayApp} for about ${awayMinutes} minute${awayMinutes === 1 ? "" : "s"}.`);
  } else {
    lines.push(`While you were in ${awayApp}:`);
    for (const event of relevant.slice(0, 3)) {
      lines.push(event.summary);
    }
  }

  const brief = lines.join(" ");
  const next = clearCompanionAway({
    ...snapshot,
    events: [],
    lastReturnBrief: brief,
    lastReturnBriefAt: now,
    focusApp: returnedToApp.trim() || snapshot.focusApp,
    updatedAt: now,
  });

  return { brief, snapshot: next };
}

export function relationshipEventKindLabel(kind: RelationshipEventKind): string {
  switch (kind) {
    case "app_switch":
      return "App switch";
    case "terminal_error":
      return "Terminal";
    case "screen_context_change":
      return "Screen";
    default:
      return "Service";
  }
}
