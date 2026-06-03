import { DIRECT_ANSWER_ID } from "../config/routes.js";
import type { RouterDecision } from "../agents/routerAgent.js";
import type { ExecutionModeDecision } from "./executionMode.js";

export function applyExecutionModeToRoute({
  decision,
  routeId,
  routerDecision,
  useVisionDirectAnswer,
  preferredCouncilRoute,
}: {
  decision: ExecutionModeDecision;
  routeId: string;
  routerDecision?: RouterDecision;
  useVisionDirectAnswer: boolean;
  preferredCouncilRoute?: "product-decision" | "sales-attack";
}): { routeId: string; routerDecision?: RouterDecision } {
  const effective = decision.effectiveMode;

  if (effective === "vision" || useVisionDirectAnswer) {
    return {
      routeId: DIRECT_ANSWER_ID,
      routerDecision: {
        selectedWorkflow: DIRECT_ANSWER_ID,
        reason: routerDecision?.reason ?? decision.reason,
        confidence: routerDecision?.confidence ?? decision.confidence,
      },
    };
  }

  if (effective === "quick") {
    return {
      routeId: DIRECT_ANSWER_ID,
      routerDecision: {
        selectedWorkflow: DIRECT_ANSWER_ID,
        reason: `Execution Mode: Quick — ${decision.reason}`,
        confidence: Math.max(routerDecision?.confidence ?? 0, decision.confidence),
      },
    };
  }

  if (effective === "research") {
    return { routeId, routerDecision };
  }

  if (effective === "council") {
    if (routeId === DIRECT_ANSWER_ID) {
      const councilRoute =
        preferredCouncilRoute === "sales-attack" || preferredCouncilRoute === "product-decision"
          ? preferredCouncilRoute
          : "product-decision";
      return {
        routeId: councilRoute,
        routerDecision: {
          selectedWorkflow: councilRoute,
          reason: `Execution Mode: Council — ${decision.reason}`,
          confidence: decision.confidence,
        },
      };
    }
    return {
      routeId,
      routerDecision: routerDecision
        ? {
            ...routerDecision,
            reason: `Execution Mode: Council — ${routerDecision.reason}`,
          }
        : undefined,
    };
  }

  return { routeId, routerDecision };
}
