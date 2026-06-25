/**
 * Fire agent chains when a Listen Mode slice ends (build plan + meeting action plan).
 */

import { agentBus, AgentBus, type MeetingSessionPayload } from "./agentEventBus.ts";
import type { GlassConfig } from "../shared/config.ts";
import type { ListenMoment } from "../shared/listenMomentTypes.ts";

/** Minimum transcript length — must match audioBuildPlanExtractor. */
export const LISTEN_CHAIN_MIN_TRANSCRIPT_CHARS = 200;

let lastChainFireSignature: string | null = null;

export function chainFireSignature(transcript: string, moments: ListenMoment[]): string {
  return `${transcript.length}:${moments.length}:${moments.map((m) => m.id).join("|")}`;
}

export function resetListenSessionChainsDedup(): void {
  lastChainFireSignature = null;
}

export function listenSessionChainsAlreadyFired(): boolean {
  return lastChainFireSignature !== null;
}

export interface FireListenSessionChainsInput {
  transcript: string;
  moments: ListenMoment[];
  sessionId: string;
  config: GlassConfig;
}

/**
 * Fire video/audio build-plan extraction and meeting action-plan bus event.
 * Returns true if any chain was triggered. Skips when transcript/moments unchanged since last fire.
 */
export function fireListenSessionChains(input: FireListenSessionChainsInput): boolean {
  const { transcript, moments, sessionId, config } = input;
  const signature = chainFireSignature(transcript, moments);
  if (lastChainFireSignature === signature) return false;

  let fired = false;

  if (transcript.length >= LISTEN_CHAIN_MIN_TRANSCRIPT_CHARS) {
    fired = true;
    void import("./audioBuildPlanExtractor.ts")
      .then(({ extractAudioBuildPlan }) =>
        extractAudioBuildPlan(transcript, config, sessionId),
      )
      .catch((err) => {
        console.warn("[listen-stop] Audio build plan extraction failed:", err);
      });
  }

  if (moments.length >= 2) {
    fired = true;
    const actionSteps = moments
      .filter((m) => m.type === "action_step")
      .map((m) => m.summary);
    const meetingPayload: MeetingSessionPayload = {
      transcript,
      moments: moments.map((m) => ({
        type: m.type,
        summary: m.summary,
        importance: m.importance,
      })),
      actionSteps,
    };
    agentBus.publish("context.intent.meeting", meetingPayload, {
      runId: `listen-session-${sessionId}`,
      sessionId,
      correlationId: AgentBus.newCorrelationId(),
      sourceAgentId: "listen-mode",
    });
  }

  if (fired) {
    lastChainFireSignature = signature;
  }
  return fired;
}
