/**
 * Listen mode — auto-surfaced IIVO thought cards.
 *
 * Thoughts appear without requiring Explain/Apply/Save. Optional actions remain.
 */

import type { GlassCopilotIntervention } from "./copilotTypes.ts";
import type { ListenMoment } from "./listenMomentTypes.ts";

export function buildListenThoughtIntervention(
  moment: ListenMoment,
  deps: { idFactory: () => string; clock: () => string },
): GlassCopilotIntervention {
  const body = moment.suggestedThought ?? moment.summary;
  return {
    id: deps.idFactory(),
    kind: "generic",
    title: "IIVO thought",
    body,
    buttons: [
      { action: "save", label: "Save", primary: true },
      { action: "turn-into-action", label: "Expand" },
      { action: "create-prompt", label: "Create prompt" },
      { action: "dismiss", label: "Dismiss" },
    ],
    createdAt: deps.clock(),
  };
}
