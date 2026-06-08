import { DIRECT_ANSWER_ID } from "../config/routes.js";
import { forcesDirectAnswerRoute } from "./directAnswerHeuristic.js";
import { classifyPromptRoute } from "./routingHeuristics.js";
import { resolveResponsePlan } from "../responseContracts/resolveResponsePlan.js";
import { callOpenAI } from "../providers/openai.js";
import { MODELS } from "../config/models.js";
import type { RouterSelection } from "../config/routes.js";

export interface RouterDecision {
  selectedWorkflow: RouterSelection;
  reason: string;
  confidence: number;
}

const ROUTER_MAX_TOKENS = 300;

const SYSTEM_PROMPT = `You are the IIVO Auto Router. Select the best processing path for the user's prompt.

Routes (return exact id in selectedWorkflow):
- direct_answer — simple explanation, definition, rewrite, summary, or general Q&A that ONE model can handle. No research scouts, no multi-agent council.
- sales-attack — customers, prospects, outreach, leads, sales scripts, pricing pitch, OR finding specific businesses/entities to contact (entity search runs inside this workflow).
- product-decision — build/add/kill a feature or product; roadmap tradeoffs; "should I X now or later"
- market-research — market trends, market size, industry evidence, problem validation (source-backed research, not finding one business)
- competitive-intelligence — analyze competitors, positioning, pricing vs alternatives
- technical-audit — code, architecture, security, implementation, QA, "what could break"

Rules:
- Use direct_answer for "what is X", "explain", "rewrite", "summarize", copy polish, hero rewrites, support replies, and simple advice — NOT sales-attack.
- Use sales-attack ONLY for prospecting, cold email/call outreach, lead gen, or "find one verified business/plumber/company in [city]" (entity search is automatic in Research Scout).
- Do NOT use sales-attack for "rewrite the hero", "make this clearer", or "plain English" marketing copy tasks.
- Do NOT use full council for simple chat that one model can answer.
- Do NOT route entity/prospect finding to market-research.

Respond with JSON only, no markdown:
{"selectedWorkflow":"...","reason":"one short sentence","confidence":0-100}`;

function isCouncilWorkflow(id: string): boolean {
  return [
    "sales-attack",
    "product-decision",
    "market-research",
    "competitive-intelligence",
    "technical-audit",
  ].includes(id);
}

function parseRouterResponse(text: string): RouterDecision | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as {
      selectedWorkflow?: string;
      reason?: string;
      confidence?: number;
    };
    const id = parsed.selectedWorkflow;
    if (!id || (id !== DIRECT_ANSWER_ID && !isCouncilWorkflow(id))) return null;
    return {
      selectedWorkflow: id as RouterSelection,
      reason: parsed.reason?.trim() || "Router selection.",
      confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 50)),
    };
  } catch {
    return null;
  }
}

function heuristicToDecision(h: ReturnType<typeof classifyPromptRoute>): RouterDecision {
  return {
    selectedWorkflow: h!.selectedWorkflow,
    reason: h!.reason,
    confidence: h!.confidence,
  };
}

export type RouterDecidingLayer = "fast_direct" | "heuristic" | "llm_router";

export interface RouterAgentResult {
  decision: RouterDecision;
  decidingLayer: RouterDecidingLayer;
}

export async function runRouterAgent(
  userPrompt: string,
  signal?: AbortSignal,
  options?: { effectivePrompt?: string },
): Promise<RouterAgentResult> {
  const routeText = options?.effectivePrompt?.trim() || userPrompt.trim();
  const responsePlan = resolveResponsePlan(routeText);
  if (responsePlan.lane.lane === "fast_direct") {
    return {
      decidingLayer: "fast_direct",
      decision: {
        selectedWorkflow: DIRECT_ANSWER_ID,
        reason: responsePlan.lane.reason,
        confidence: 95,
      },
    };
  }

  const heuristic = classifyPromptRoute(routeText);
  if (heuristic) {
    return {
      decidingLayer: "heuristic",
      decision: heuristicToDecision(heuristic),
    };
  }

  try {
    const result = await callOpenAI(
      SYSTEM_PROMPT,
      userPrompt,
      signal,
      MODELS.openai.gpt4o,
      ROUTER_MAX_TOKENS,
    );
    const parsed = parseRouterResponse(result.content);
    if (parsed) {
      if (
        parsed.selectedWorkflow !== DIRECT_ANSWER_ID &&
        (forcesDirectAnswerRoute(routeText) ||
          ["deliverable_first", "rewrite_only", "support_reply_first", "summary_first"].includes(
            responsePlan.contract.id,
          ))
      ) {
        const fallback = classifyPromptRoute(routeText);
        if (fallback?.selectedWorkflow === DIRECT_ANSWER_ID) {
          return {
            decidingLayer: "heuristic",
            decision: heuristicToDecision(fallback),
          };
        }
        return {
          decidingLayer: "heuristic",
          decision: {
            selectedWorkflow: DIRECT_ANSWER_ID,
            reason: "Rewrite, support, or fast-lane utility — direct answer, not council.",
            confidence: 88,
          },
        };
      }
      return { decidingLayer: "llm_router", decision: parsed };
    }
  } catch {
    /* fall through */
  }

  const fallback = classifyPromptRoute(routeText);
  if (fallback) {
    return {
      decidingLayer: "heuristic",
      decision: heuristicToDecision(fallback),
    };
  }

  return {
    decidingLayer: "heuristic",
    decision: {
      selectedWorkflow: DIRECT_ANSWER_ID,
      reason: "No strong council signals — answered directly.",
      confidence: 55,
    },
  };
}

export async function runBenchmarkBaseline(
  fullPrompt: string,
  signal?: AbortSignal,
): Promise<{ content: string; cost: import("../providers/types.js").ProviderResult }> {
  const systemPrompt = `You are a single general-purpose AI assistant. Answer the user's business problem directly with one comprehensive response. Be actionable.`;
  const result = await callOpenAI(
    systemPrompt,
    fullPrompt,
    signal,
    MODELS.openai.gpt4o,
    1500,
  );
  return { content: result.content, cost: result };
}
