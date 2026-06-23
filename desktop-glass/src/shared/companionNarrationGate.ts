/**
 * Pure narration gating for Aletheia agent/coder speech in the overlay.
 */

import type { GlassAgentId } from "./ipc.ts";

export interface AgentNarrateGateInput {
  privacyActive: boolean;
  privacyPending: boolean;
  companionActive: boolean;
  glassIdeActive: boolean;
  agentId: GlassAgentId;
}

export function isCompanionNarrationPrivacyBlocked(
  privacyActive: boolean,
  privacyPending: boolean,
): boolean {
  return privacyActive || privacyPending;
}

/** Whether an agent narrate event should enter the overlay TTS queue. */
export function shouldEnqueueAgentNarrate(input: AgentNarrateGateInput): boolean {
  if (isCompanionNarrationPrivacyBlocked(input.privacyActive, input.privacyPending)) {
    return false;
  }
  if (input.agentId !== "coder" && !input.companionActive) return false;
  if (input.glassIdeActive) {
    if (input.agentId !== "coder") return false;
    // IDE + companion: advisory owns speech — suppress agent narrate including coder.
    if (input.companionActive) return false;
  }
  return true;
}

export function canDrainCompanionNarrationQueue(input: {
  privacyActive: boolean;
  privacyPending: boolean;
  companionActive: boolean;
  queueLength: number;
}): boolean {
  if (isCompanionNarrationPrivacyBlocked(input.privacyActive, input.privacyPending)) {
    return false;
  }
  if (input.companionActive) return true;
  return input.queueLength > 0;
}
