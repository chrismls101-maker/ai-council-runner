import { normalizePromptForRouting } from "../agents/promptNormalize.js";
import type { ResponseContract } from "./responseContract.js";
import type { TaskIntent, TaskIntentResult } from "./taskIntent.js";

export type RouteLane =
  | "fast_direct"
  | "council_hidden"
  | "council_report"
  | "vision"
  | "research";

export type RouteLaneDecision = {
  lane: RouteLane;
  preferredRoute:
    | "direct_answer"
    | "product-decision"
    | "sales-attack"
    | "vision"
    | "research";
  reason: string;
  targetLatencySeconds?: number;
};

const ASSET_STRATEGY_SIGNALS =
  /\b(campaign plan|go-to-market|\bgtm\b|acquisition plan|sales strategy|outreach strategy|multi-touch sequence|full outreach plan)\b/i;

export function selectRouteLane(
  intent: TaskIntentResult,
  contract: ResponseContract,
  prompt: string,
): RouteLaneDecision {
  const text = normalizePromptForRouting(prompt.trim());

  switch (intent.intent as TaskIntent) {
    case "vision_analysis":
      return {
        lane: "vision",
        preferredRoute: "vision",
        reason: "Screenshot or visual analysis — vision path.",
        targetLatencySeconds: 25,
      };

    case "rewrite_polish":
    case "summary":
    case "support_response":
    case "direct_answer":
      return {
        lane: "fast_direct",
        preferredRoute: "direct_answer",
        reason: `Fast direct answer for ${intent.intent.replace(/_/g, " ")}.`,
        targetLatencySeconds: 20,
      };

    case "asset_generation": {
      if (ASSET_STRATEGY_SIGNALS.test(text)) {
        return {
          lane: "council_report",
          preferredRoute: "sales-attack",
          reason: "Sales asset with campaign/strategy scope — council report lane.",
          targetLatencySeconds: 120,
        };
      }
      if (
        /\b(cold email|outreach email|sales email|sales script|voicemail|linkedin message|pitch to)\b/i.test(
          text,
        )
      ) {
        return {
          lane: "council_hidden",
          preferredRoute: "sales-attack",
          reason:
            "Outbound sales deliverable — Sales Attack internally, deliverable-first final answer.",
          targetLatencySeconds: 90,
        };
      }
      return {
        lane: "fast_direct",
        preferredRoute: "direct_answer",
        reason: "Simple copy deliverable — fast direct answer, deliverable-first contract.",
        targetLatencySeconds: 25,
      };
    }

    case "decision":
      return {
        lane: "council_report",
        preferredRoute: "product-decision",
        reason: "Prioritization or tradeoff — Product Decision council.",
        targetLatencySeconds: 150,
      };

    case "strategy":
      return {
        lane: "council_report",
        preferredRoute: "sales-attack",
        reason: "Strategy or GTM plan — council report allowed.",
        targetLatencySeconds: 150,
      };

    case "research":
      return {
        lane: "research",
        preferredRoute: "research",
        reason: "Research brief — sources and findings.",
        targetLatencySeconds: 120,
      };

    case "analysis":
      return {
        lane: "council_report",
        preferredRoute: "product-decision",
        reason: "Deep analysis — structured council output.",
        targetLatencySeconds: 150,
      };

    default:
      if (contract.id === "deliverable_first" || contract.id === "rewrite_only") {
        return {
          lane: "fast_direct",
          preferredRoute: "direct_answer",
          reason: "Deliverable-style contract — default fast direct.",
          targetLatencySeconds: 25,
        };
      }
      return {
        lane: "council_hidden",
        preferredRoute: "sales-attack",
        reason: "Ambiguous task — council with compressed user-facing answer.",
        targetLatencySeconds: 90,
      };
  }
}
