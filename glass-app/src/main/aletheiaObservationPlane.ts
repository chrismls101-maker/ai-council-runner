/**
 * Aletheia observation plane host (B1.1).
 *
 * Builds live observation snapshots, persists signal changes to SQLite,
 * and push-if-changed into GlassState.
 */

import {
  buildAletheiaObservationSnapshot,
  observationSnapshotPersistKey,
  observationSnapshotsEqual,
  type AletheiaObservationSnapshot,
  type ObservationPlaneInput,
} from "../shared/aletheiaObservationSignals.ts";
import {
  appendObservationSnapshot,
  countObservationSnapshotsForSession,
} from "./aletheiaSessionStore.ts";

export interface AletheiaObservationPlaneHost {
  buildInput: () => ObservationPlaneInput;
  getSnapshot: () => AletheiaObservationSnapshot | undefined;
  setSnapshot: (snapshot: AletheiaObservationSnapshot) => void;
  push: () => void;
}

const PERSIST_THROTTLE_MS = 60_000;

let lastPersistAt = 0;
let lastPersistKey = "";

export function resetAletheiaObservationPlanePersistenceForTests(): void {
  lastPersistAt = 0;
  lastPersistKey = "";
}

function shouldPersistSnapshot(
  previous: AletheiaObservationSnapshot | undefined,
  current: AletheiaObservationSnapshot,
  now: number,
): boolean {
  const key = observationSnapshotPersistKey(current);
  if (key !== lastPersistKey) return true;
  if (!observationSnapshotsEqual(previous, current)) return true;
  return now - lastPersistAt >= PERSIST_THROTTLE_MS;
}

export function refreshAletheiaObservationPlane(
  host: AletheiaObservationPlaneHost,
  options: { forcePush?: boolean; forcePersist?: boolean } = {},
): AletheiaObservationSnapshot {
  const previous = host.getSnapshot();
  const input = host.buildInput();
  const sessionId = input.sessionId;
  const sessionSnapshotCount = sessionId
    ? countObservationSnapshotsForSession(sessionId)
    : 0;

  const snapshot = buildAletheiaObservationSnapshot({
    ...input,
    sessionSnapshotCount,
  });
  host.setSnapshot(snapshot);

  const now = snapshot.updatedAt;
  if (
    sessionId
    && (options.forcePersist || shouldPersistSnapshot(previous, snapshot, now))
  ) {
    appendObservationSnapshot(sessionId, snapshot);
    lastPersistAt = now;
    lastPersistKey = observationSnapshotPersistKey(snapshot);
    snapshot.sessionSnapshotCount = sessionId
      ? countObservationSnapshotsForSession(sessionId)
      : 0;
    host.setSnapshot(snapshot);
  }

  if (
    options.forcePush
    || !observationSnapshotsEqual(previous, snapshot)
  ) {
    host.push();
  }

  return snapshot;
}
