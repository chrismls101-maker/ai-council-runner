import { normalizeTokenMode, type TokenMode } from "../config/tokenModes.js";
import { DIRECT_ANSWER_ID } from "../config/routes.js";
import { classifyPromptRoute } from "../agents/routingHeuristics.js";
import { isEntitySearchIntent } from "../agents/researchIntent.js";
import type { CreditBreakdownLine, CreditEstimate } from "./types.js";

const WORKFLOW_BASE_CREDITS: Record<string, number> = {
  [DIRECT_ANSWER_ID]: 1,
  "product-decision": 5,
  "sales-attack": 7,
  "market-research": 8,
  "competitive-intelligence": 8,
  "technical-audit": 8,
};

export const VISION_IMAGE_ADDON_CREDITS = 2;

const ENTITY_SEARCH_CREDITS = 3;

const TOKEN_MODE_MULTIPLIER: Record<TokenMode, number> = {
  small: 1,
  standard: 1.5,
  deep: 2,
};

const BENCHMARK_ADDON_CREDITS = 3;
const BENCHMARK_LAB_BASELINE_CREDITS = 1;
const BENCHMARK_LAB_OVERHEAD_CREDITS = 3;
const BENCHMARK_AI_JUDGE_CREDITS = 1;

export function resolveRouteForEstimate(input: {
  workflowId?: string;
  route?: string;
  prompt?: string;
}): { routeId: string; entitySearch: boolean } {
  const routeHint = input.route?.trim();
  if (routeHint && routeHint !== "auto") {
    const entitySearch =
      routeHint !== DIRECT_ANSWER_ID &&
      Boolean(input.prompt && isEntitySearchIntent(input.prompt));
    return { routeId: routeHint, entitySearch };
  }

  const workflowId = input.workflowId?.trim() || "auto";
  if (workflowId !== "auto") {
    const entitySearch =
      workflowId !== DIRECT_ANSWER_ID &&
      Boolean(input.prompt && isEntitySearchIntent(input.prompt));
    return { routeId: workflowId, entitySearch };
  }

  if (input.prompt) {
    const heuristic = classifyPromptRoute(input.prompt);
    if (heuristic) {
      return {
        routeId: heuristic.selectedWorkflow,
        entitySearch:
          heuristic.researchMode === "entity_search" ||
          (heuristic.selectedWorkflow === "sales-attack" &&
            isEntitySearchIntent(input.prompt)),
      };
    }
  }

  return { routeId: "product-decision", entitySearch: false };
}

function baseCreditsForRoute(routeId: string, entitySearch: boolean): number {
  if (routeId === DIRECT_ANSWER_ID) return WORKFLOW_BASE_CREDITS[DIRECT_ANSWER_ID];
  if (entitySearch && routeId === "sales-attack") return ENTITY_SEARCH_CREDITS;
  return WORKFLOW_BASE_CREDITS[routeId] ?? WORKFLOW_BASE_CREDITS["product-decision"];
}

export function estimateCredits(input: {
  workflowId?: string;
  route?: string;
  tokenMode?: unknown;
  benchmarkEnabled?: boolean;
  prompt?: string;
  visionScreenshotAnalysis?: boolean;
}): CreditEstimate {
  const tokenMode = normalizeTokenMode(input.tokenMode);
  const benchmarkEnabled = Boolean(input.benchmarkEnabled);
  const { routeId, entitySearch } = resolveRouteForEstimate(input);

  const breakdown: CreditBreakdownLine[] = [];
  const base = baseCreditsForRoute(routeId, entitySearch);
  breakdown.push({
    label:
      entitySearch && routeId === "sales-attack"
        ? "Entity Search"
        : formatWorkflowLabel(routeId),
    credits: base,
  });

  if (input.visionScreenshotAnalysis) {
    breakdown.push({
      label: "Vision image analysis add-on",
      credits: VISION_IMAGE_ADDON_CREDITS,
    });
  }

  const multiplier = TOKEN_MODE_MULTIPLIER[tokenMode];
  if (multiplier !== 1) {
    breakdown.push({
      label: `${formatTokenModeLabel(tokenMode)} mode (${multiplier}x)`,
      credits: Math.ceil(base * multiplier) - base,
    });
  }

  let subtotal = Math.ceil(base * multiplier);
  if (input.visionScreenshotAnalysis) {
    subtotal += VISION_IMAGE_ADDON_CREDITS;
  }

  if (benchmarkEnabled) {
    breakdown.push({ label: "Benchmark mode", credits: BENCHMARK_ADDON_CREDITS });
    subtotal += BENCHMARK_ADDON_CREDITS;
  }

  return {
    estimatedCredits: subtotal,
    breakdown,
    workflowId: routeId,
    tokenMode,
    benchmarkEnabled,
    entitySearch,
  };
}

export function estimateBenchmarkLabCredits(input: {
  workflowId?: string;
  tokenMode?: unknown;
  prompt?: string;
  aiJudgeEnabled?: boolean;
}): import("../benchmarks/types.js").BenchmarkCreditEstimate {
  const iivoEstimate = estimateCredits({
    workflowId: input.workflowId,
    tokenMode: input.tokenMode,
    prompt: input.prompt,
    benchmarkEnabled: false,
  });
  const judgeCredits = input.aiJudgeEnabled ? BENCHMARK_AI_JUDGE_CREDITS : 0;
  const breakdown = [
    { label: "Baseline single model", credits: BENCHMARK_LAB_BASELINE_CREDITS },
    ...iivoEstimate.breakdown.map((line) => ({
      label: `IIVO: ${line.label}`,
      credits: line.credits,
    })),
    { label: "Benchmark Lab overhead", credits: BENCHMARK_LAB_OVERHEAD_CREDITS },
  ];
  if (judgeCredits > 0) {
    breakdown.push({ label: "AI judge (optional)", credits: judgeCredits });
  }
  const totalCredits =
    BENCHMARK_LAB_BASELINE_CREDITS +
    iivoEstimate.estimatedCredits +
    BENCHMARK_LAB_OVERHEAD_CREDITS +
    judgeCredits;
  return {
    baselineCredits: BENCHMARK_LAB_BASELINE_CREDITS,
    iivoCredits: iivoEstimate.estimatedCredits,
    benchmarkOverheadCredits: BENCHMARK_LAB_OVERHEAD_CREDITS,
    judgeCredits,
    totalCredits,
    breakdown,
  };
}

export function getCreditCostTable(): CreditBreakdownLine[] {
  return [
    { label: "Direct Answer", credits: WORKFLOW_BASE_CREDITS[DIRECT_ANSWER_ID] },
    { label: "Vision image analysis add-on", credits: VISION_IMAGE_ADDON_CREDITS },
    { label: "Entity Search", credits: ENTITY_SEARCH_CREDITS },
    { label: "Product Decision", credits: WORKFLOW_BASE_CREDITS["product-decision"] },
    { label: "Sales Attack", credits: WORKFLOW_BASE_CREDITS["sales-attack"] },
    { label: "Market Research", credits: WORKFLOW_BASE_CREDITS["market-research"] },
    {
      label: "Competitive Intelligence",
      credits: WORKFLOW_BASE_CREDITS["competitive-intelligence"],
    },
    { label: "Technical Audit", credits: WORKFLOW_BASE_CREDITS["technical-audit"] },
    { label: "Benchmark add-on (composer)", credits: BENCHMARK_ADDON_CREDITS },
    { label: "Benchmark Lab overhead", credits: BENCHMARK_LAB_OVERHEAD_CREDITS },
    { label: "Benchmark Lab baseline", credits: BENCHMARK_LAB_BASELINE_CREDITS },
    { label: "Quick / Small mode", credits: 1 },
    { label: "Standard mode multiplier", credits: 1.5 },
    { label: "Deep mode multiplier", credits: 2 },
  ];
}

function formatWorkflowLabel(routeId: string): string {
  if (routeId === DIRECT_ANSWER_ID) return "Direct Answer";
  return routeId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTokenModeLabel(mode: TokenMode): string {
  if (mode === "small") return "Quick";
  if (mode === "standard") return "Standard";
  return "Deep";
}

export function shouldWarnBeforeRun(input: {
  estimatedCredits: number;
  currentCredits: number;
}): boolean {
  const remaining = input.currentCredits - input.estimatedCredits;
  return input.estimatedCredits >= 5 || remaining < 20;
}

export function shouldConfirmBeforeRun(input: {
  estimatedCredits: number;
  currentCredits: number;
  tokenMode?: unknown;
  benchmarkEnabled?: boolean;
}): boolean {
  const tokenMode = normalizeTokenMode(input.tokenMode);
  const remaining = input.currentCredits - input.estimatedCredits;
  return (
    input.estimatedCredits >= 7 ||
    tokenMode === "deep" ||
    Boolean(input.benchmarkEnabled) ||
    remaining < 20
  );
}

export function calculateRefundCredits(input: {
  creditsCharged: number;
  status: "complete" | "partial" | "error";
  providerCallsStarted: boolean;
  directAnswerFailedBeforeModel: boolean;
}): number {
  if (input.creditsCharged <= 0) return 0;
  if (input.status === "complete") return 0;
  if (input.directAnswerFailedBeforeModel) return input.creditsCharged;
  if (!input.providerCallsStarted) return input.creditsCharged;
  return Math.floor(input.creditsCharged * 0.5);
}
