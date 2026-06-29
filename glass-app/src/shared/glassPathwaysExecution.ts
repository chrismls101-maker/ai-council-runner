/**
 * Glass Pathways — controlled execution helpers (Phase 6).
 * Routes through existing computer-operator grant flow; no separate trust system.
 */

import type { Pathway, Stage, PathwayLiveSession } from "./glassPathwaysTypes.ts";
import type { PathwayActionRouteKind } from "./glassPathwaysActionRouting.ts";
import { detectStagePrivacyHandoff } from "./glassPathwaysEscort.ts";
import { recommendedNextMove } from "./glassPathwaysGuidance.ts";

export interface PathwayExecutionEligibility {
  allowed: boolean;
  reason?: string;
}

export function buildPathwayExecutionGoal(
  pathway: Pathway,
  stage: Stage,
): string {
  const action = recommendedNextMove(stage, pathway);
  return [
    "Glass Pathway — bounded execution for the current stage only.",
    `Pathway: ${pathway.title}`,
    `Goal: ${pathway.goal}`,
    `Stage ${stage.index}: ${stage.title}`,
    `Objective: ${stage.objective}`,
    `Do this part: ${action}`,
    "Stay within this stage scope. Do not send, delete, or take destructive actions.",
    "Stop and report if credentials, billing, or private identity input is required.",
  ].join("\n");
}

export function assessPathwayExecutionEligibility(
  pathway: Pathway,
  stage: Stage,
  options?: {
    companionPrivacyActive?: boolean;
    liveSessionMode?: PathwayLiveSession["mode"];
    primaryRoute?: PathwayActionRouteKind;
    explicitFallback?: boolean;
  },
): PathwayExecutionEligibility {
  if (options?.companionPrivacyActive) {
    return {
      allowed: false,
      reason: "Finish or resume from privacy handoff before execution.",
    };
  }

  if (options?.liveSessionMode === "escort") {
    return {
      allowed: false,
      reason: "Finish escort mode before starting controlled execution.",
    };
  }

  if (options?.liveSessionMode === "connector") {
    return {
      allowed: false,
      reason: "Finish the connector action before starting computer operator.",
    };
  }

  if (options?.liveSessionMode === "observe") {
    return {
      allowed: false,
      reason: "Finish observational guidance before starting computer operator.",
    };
  }

  if (
    !options?.explicitFallback
    && (options?.primaryRoute === "connector" || options?.primaryRoute === "observe")
  ) {
    return {
      allowed: false,
      reason: "Try the recommended path above first — computer operator is the fallback.",
    };
  }

  const privacy = detectStagePrivacyHandoff(stage, pathway);
  if (privacy.needed) {
    return {
      allowed: false,
      reason: "This stage needs a privacy handoff — Aletheia should not act here.",
    };
  }

  if (stage.status === "completed") {
    return { allowed: false, reason: "This stage is already complete." };
  }

  const move = recommendedNextMove(stage, pathway).trim();
  if (!move) {
    return { allowed: false, reason: "No concrete action to execute for this stage." };
  }

  return { allowed: true };
}

export function pathwayExecutionScopeLines(): string[] {
  return [
    "One bounded computer-operator session for this stage",
    "Forbidden: send, delete, close, destructive actions",
    "Stops if sensitive input is required",
  ];
}
