import { DIRECT_ANSWER_ID } from "../config/routes.js";
import type { RouterSelection } from "../config/routes.js";
import { resolveResponsePlan } from "../responseContracts/resolveResponsePlan.js";
import {
  COPY_REWRITE_INTENT,
  detectDirectAnswer,
  FAST_LANE_DIRECT_INTENT,
  LEGAL_POLICY_INTENT,
  SALES_OUTREACH_INTENT,
  SUPPORT_REWRITE_INTENT,
} from "./directAnswerHeuristic.js";
import { normalizePromptForRouting } from "./promptNormalize.js";
import { isEntitySearchIntent } from "./researchIntent.js";

export interface HeuristicRoute {
  selectedWorkflow: RouterSelection;
  reason: string;
  confidence: number;
  /** Research mode hint when sales-attack uses entity search. */
  researchMode?: "entity_search" | "sonar";
}

const SUPPORT_DIRECT_KEYWORDS = SUPPORT_REWRITE_INTENT;

const LEGAL_POLICY_KEYWORDS = LEGAL_POLICY_INTENT;

const SALES_KEYWORDS = SALES_OUTREACH_INTENT;

const PRODUCT_DECISION_KEYWORDS =
  /\b(should i (add|build|launch|kill|ship)|which should .+ build first|users keep asking for|product decision|feature now or after|prioritize|build now vs|now or after|add .+ now|roadmap|tradeoff|trade-off|pilot customers?)\b/i;

const MARKET_RESEARCH_KEYWORDS =
  /\b(market research|market trend|market size|industry evidence|problem validation|segment|opportunity|industry size|source-backed research)\b/i;

const COMPETITIVE_KEYWORDS =
  /\b(competitors?|competitive intelligence|competitive|positioning|vs\.? |versus|attack angles)\b/i;

const TECHNICAL_KEYWORDS =
  /\b(audit|architecture|security review|code review|technical debt|implementation plan|qa strategy|test strategy|what could break|system review)\b/i;

/**
 * Fast heuristic routing before LLM router. Returns null when LLM should decide.
 */
export function classifyPromptRoute(prompt: string): HeuristicRoute | null {
  const text = normalizePromptForRouting(prompt.trim());
  if (!text) return null;

  const plan = resolveResponsePlan(text);

  if (SUPPORT_DIRECT_KEYWORDS.test(text)) {
    return {
      selectedWorkflow: DIRECT_ANSWER_ID,
      reason: "Support or rewrite task — direct answer, not sales council.",
      confidence: 93,
    };
  }

  if (LEGAL_POLICY_KEYWORDS.test(text)) {
    return {
      selectedWorkflow: DIRECT_ANSWER_ID,
      reason: "Legal or privacy advisory — direct answer, not sales council.",
      confidence: 92,
    };
  }

  if (detectDirectAnswer(text)) {
    return {
      selectedWorkflow: DIRECT_ANSWER_ID,
      reason: "Simple question or rewrite — one model is enough.",
      confidence: 92,
    };
  }

  if (plan.lane.preferredRoute === "sales-attack" && plan.lane.lane !== "fast_direct") {
    return {
      selectedWorkflow: "sales-attack",
      reason: plan.lane.reason,
      confidence: 90,
    };
  }
  if (plan.lane.lane === "fast_direct" && plan.lane.preferredRoute === "direct_answer") {
    return {
      selectedWorkflow: DIRECT_ANSWER_ID,
      reason: plan.lane.reason,
      confidence: 95,
    };
  }
  if (plan.lane.preferredRoute === "product-decision") {
    return {
      selectedWorkflow: "product-decision",
      reason: plan.lane.reason,
      confidence: 90,
    };
  }

  if (COPY_REWRITE_INTENT.test(text) && !SALES_OUTREACH_INTENT.test(text)) {
    return {
      selectedWorkflow: DIRECT_ANSWER_ID,
      reason: "Copy rewrite or polish — direct answer, not sales council.",
      confidence: 94,
    };
  }

  if (FAST_LANE_DIRECT_INTENT.test(text) && !SALES_OUTREACH_INTENT.test(text)) {
    return {
      selectedWorkflow: DIRECT_ANSWER_ID,
      reason: "Simple utility task — fast direct answer, no council.",
      confidence: 93,
    };
  }

  if (isEntitySearchIntent(text)) {
    return {
      selectedWorkflow: "sales-attack",
      reason:
        "Prospect or verified-entity search — Sales Attack council with entity search research.",
      confidence: 90,
      researchMode: "entity_search",
    };
  }

  if (PRODUCT_DECISION_KEYWORDS.test(text)) {
    return {
      selectedWorkflow: "product-decision",
      reason: "Product or feature tradeoff — needs structured product decision council.",
      confidence: 86,
    };
  }

  if (TECHNICAL_KEYWORDS.test(text)) {
    return {
      selectedWorkflow: "technical-audit",
      reason: "Technical or architecture review — Technical Audit council.",
      confidence: 84,
    };
  }

  if (COMPETITIVE_KEYWORDS.test(text)) {
    return {
      selectedWorkflow: "competitive-intelligence",
      reason: "Competitor analysis — Competitive Intelligence council.",
      confidence: 82,
    };
  }

  if (MARKET_RESEARCH_KEYWORDS.test(text)) {
    return {
      selectedWorkflow: "market-research",
      reason: "Market or industry research — Market Research council with sources.",
      confidence: 80,
      researchMode: "sonar",
    };
  }

  if (SALES_KEYWORDS.test(text)) {
    return {
      selectedWorkflow: "sales-attack",
      reason: "Sales, outreach, or customer acquisition — Sales Attack council.",
      confidence: 78,
    };
  }

  return null;
}

/** Expected route for routing test matrix (heuristic preview). */
export function expectedRouteForPrompt(prompt: string): string {
  const route = classifyPromptRoute(prompt);
  if (route) {
    if (route.researchMode === "entity_search") {
      return `${route.selectedWorkflow} + entity_search`;
    }
    return route.selectedWorkflow;
  }
  return "router (LLM)";
}
