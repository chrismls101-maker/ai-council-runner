/**
 * Aletheia pending advice plane (B2.1) — main-process refresh + push-if-changed.
 */

import {
  emptyAletheiaPendingAdviceSnapshot,
  generateAletheiaAdviceCards,
  mergeAletheiaAdviceCards,
  pendingAdviceSnapshotsEqual,
  type AletheiaPendingAdviceSnapshot,
} from "../shared/aletheiaPendingAdvice.ts";
import type { AletheiaActivationState } from "../shared/aletheiaActivationPolicy.ts";
import type { AletheiaAmbientSynthesisSnapshot } from "../shared/aletheiaAmbientSynthesis.ts";

export interface AletheiaPendingAdvicePlaneHost {
  getCompanionModeActive: () => boolean;
  getCompanionPrivacyActive: () => boolean;
  getActivation: () => AletheiaActivationState | undefined;
  getAmbientSynthesis: () => AletheiaAmbientSynthesisSnapshot | undefined;
  getInitiativeLevel?: () => import("../shared/aletheiaPersonaBehavior.ts").AletheiaInitiativeLevel | undefined;
  getSnapshot: () => AletheiaPendingAdviceSnapshot | undefined;
  setSnapshot: (snapshot: AletheiaPendingAdviceSnapshot | undefined) => void;
  push: () => void;
}

export function refreshAletheiaPendingAdvicePlane(
  host: AletheiaPendingAdvicePlaneHost,
  options?: { forcePush?: boolean },
): AletheiaPendingAdviceSnapshot {
  const previous = host.getSnapshot() ?? emptyAletheiaPendingAdviceSnapshot();
  const ambient = host.getAmbientSynthesis();

  if (!host.getCompanionModeActive()) {
    if (previous.cards.length > 0) {
      host.setSnapshot(undefined);
      if (options?.forcePush) host.push();
    }
    return emptyAletheiaPendingAdviceSnapshot();
  }

  const incoming = generateAletheiaAdviceCards({
    companionModeActive: host.getCompanionModeActive(),
    companionPrivacyActive: host.getCompanionPrivacyActive(),
    activation: host.getActivation(),
    connections: ambient?.connections ?? [],
    existingCards: previous.cards,
    initiativeLevel: host.getInitiativeLevel?.(),
  });

  const next = incoming.length > 0
    ? mergeAletheiaAdviceCards(previous.cards, incoming)
    : previous;

  host.setSnapshot(next);

  if (options?.forcePush || !pendingAdviceSnapshotsEqual(previous, next)) {
    host.push();
  }

  return next;
}
