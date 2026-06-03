import { normalizePromptForRouting } from "../agents/promptNormalize.js";
import type { ResponseContract } from "../responseContracts/responseContract.js";
import type { TaskIntentResult } from "../responseContracts/taskIntent.js";
import type { ExecutionModeTrace } from "./executionModeTrace.js";

export type ExecutionMode = "auto" | "quick" | "council" | "builder";

export type EffectiveExecutionMode = "quick" | "council" | "builder" | "vision" | "research";

export type ExecutionModeDecision = {
  mode: ExecutionMode;
  effectiveMode: EffectiveExecutionMode;
  confidence: number;
  reason: string;
  requiresConfirmation?: boolean;
  confirmationKind?: "council" | "builder";
  confirmationReason?: string;
  targetLatencySeconds?: number;
};

export const LEGAL_PRIVACY_PROMPT =
  /\b(privacy policy|privacy promise|gdpr|ccpa|legal|compliance|terms of service|data retention|collect(s)? emails|what (should|must) (we|it) avoid promising)\b/i;

const LEGAL_PRIVACY = LEGAL_PRIVACY_PROMPT;

const DECISION_SIGNALS =
  /\b(should i|which should|what should i (do|build|prioritize)|tradeoff|trade-off|or .+ or .+|choose between|decision between|prioritize|build first|now or after|roadmap choice)\b/i;

const STRATEGY_SIGNALS =
  /\b(go-to-market|\bgtm\b|strategic plan|strategy for|risk analysis|competitive strategy|market entry|positioning strategy|full (sales|gtm) strategy)\b/i;

const ONE_COLD_EMAIL =
  /\b(write|draft).{0,40}(cold email|outreach email|sales email)\b/i;

const LARGE_BUILD =
  /\b(build (me )?(a )?full|create a (full )?|complete (business plan|proposal|campaign|landing page|financial model|website audit)|multi-?section document|full project plan)\b/i;

const EXPLICIT_RESEARCH =
  /\b(market research|industry research|source-backed research|competitive intelligence report|research the market)\b/i;

function isQuickIntent(intent: TaskIntentResult, contract: ResponseContract, text: string): boolean {
  if (LEGAL_PRIVACY.test(text)) return true;
  if (
    intent.intent === "rewrite_polish" ||
    intent.intent === "summary" ||
    intent.intent === "support_response" ||
    intent.intent === "direct_answer"
  ) {
    return true;
  }
  if (contract.id === "rewrite_only" || contract.id === "support_reply_first" || contract.id === "summary_first") {
    return true;
  }
  if (ONE_COLD_EMAIL.test(text) && !STRATEGY_SIGNALS.test(text)) return true;
  if (contract.id === "deliverable_first" && !DECISION_SIGNALS.test(text) && !STRATEGY_SIGNALS.test(text)) {
    return true;
  }
  return false;
}

function isCouncilIntent(intent: TaskIntentResult, text: string): boolean {
  if (intent.intent === "decision" || intent.intent === "strategy") return true;
  if (DECISION_SIGNALS.test(text)) return true;
  if (STRATEGY_SIGNALS.test(text)) return true;
  if (intent.intent === "analysis") return true;
  return false;
}

function resolveAutoMode(
  intent: TaskIntentResult,
  contract: ResponseContract,
  artifactSelection: { type: string; renderMode: "inline" | "canvas" } | undefined,
  prompt: string,
  options?: { wantsVision?: boolean; wantsResearch?: boolean },
): ExecutionModeDecision {
  const text = normalizePromptForRouting(prompt.trim());

  if (options?.wantsVision) {
    return {
      mode: "auto",
      effectiveMode: "vision",
      confidence: 92,
      reason: "Screenshot or visual context attached — vision analysis.",
      targetLatencySeconds: 25,
    };
  }

  if (artifactSelection?.renderMode === "canvas" || (LARGE_BUILD.test(text) && artifactSelection?.type === "canvas_project")) {
    return {
      mode: "auto",
      effectiveMode: "builder",
      confidence: 88,
      reason: "Large multi-section build — Builder workspace recommended.",
      requiresConfirmation: true,
      confirmationKind: "builder",
      confirmationReason:
        "This looks like a larger build. IIVO can create it in a dedicated workspace with editing, copy, and export tools.",
      targetLatencySeconds: 120,
    };
  }

  if (options?.wantsResearch && EXPLICIT_RESEARCH.test(text)) {
    return {
      mode: "auto",
      effectiveMode: "research",
      confidence: 85,
      reason: "Explicit research request.",
      targetLatencySeconds: 120,
    };
  }

  if (isQuickIntent(intent, contract, text)) {
    return {
      mode: "auto",
      effectiveMode: "quick",
      confidence: 93,
      reason: "Simple writing, rewrite, support, summary, or one-off deliverable — fast answer.",
      targetLatencySeconds: 20,
    };
  }

  if (isCouncilIntent(intent, text)) {
    const explicitDeep =
      STRATEGY_SIGNALS.test(text) ||
      /\b(strategic decision|product decision|founder decision|deep analysis)\b/i.test(text);
    return {
      mode: "auto",
      effectiveMode: "council",
      confidence: explicitDeep ? 90 : 72,
      reason: explicitDeep
        ? "Strategic decision or multi-agent plan — Council Mode."
        : "May benefit from deeper multi-agent reasoning.",
      requiresConfirmation: !explicitDeep,
      confirmationKind: explicitDeep ? undefined : "council",
      confirmationReason: explicitDeep
        ? undefined
        : "This may take longer because IIVO will use multiple agents to think through the answer.",
      targetLatencySeconds: 120,
    };
  }

  return {
    mode: "auto",
    effectiveMode: "quick",
    confidence: 78,
    reason: "Uncertain task — defaulting to Quick Mode (fast answer).",
    targetLatencySeconds: 20,
  };
}

export function resolveExecutionMode({
  userSelectedMode,
  taskIntent,
  responseContract,
  artifactSelection,
  prompt,
  wantsVision = false,
  wantsResearch = false,
  confirmationAccepted,
  inBuilderWorkspace = false,
}: {
  userSelectedMode: ExecutionMode;
  taskIntent: TaskIntentResult;
  responseContract: ResponseContract;
  artifactSelection?: { type: string; renderMode: "inline" | "canvas" };
  prompt: string;
  wantsVision?: boolean;
  wantsResearch?: boolean;
  confirmationAccepted?: boolean;
  inBuilderWorkspace?: boolean;
}): ExecutionModeDecision {
  const text = normalizePromptForRouting(prompt.trim());

  let decision: ExecutionModeDecision;

  if (userSelectedMode === "quick") {
    if (wantsVision) {
      decision = {
        mode: "quick",
        effectiveMode: "vision",
        confidence: 95,
        reason: "Quick Mode with attached screenshot — vision path.",
        targetLatencySeconds: 25,
      };
    } else if (wantsResearch && EXPLICIT_RESEARCH.test(text)) {
      decision = {
        mode: "quick",
        effectiveMode: "research",
        confidence: 80,
        reason: "Quick Mode but explicit research requested.",
        targetLatencySeconds: 90,
      };
    } else {
      decision = {
        mode: "quick",
        effectiveMode: "quick",
        confidence: 95,
        reason: "Quick Mode — one AI, fast direct answer.",
        targetLatencySeconds: 20,
      };
    }
  } else if (userSelectedMode === "council") {
    decision = {
      mode: "council",
      effectiveMode: "council",
      confidence: 95,
      reason: "Council Mode — multi-agent reasoning for decisions and strategy.",
      targetLatencySeconds: 120,
    };
  } else if (userSelectedMode === "builder") {
    decision = {
      mode: "builder",
      effectiveMode: "builder",
      confidence: 95,
      reason: inBuilderWorkspace
        ? "Builder Mode — workspace active."
        : "Builder Mode — large artifact workspace.",
      requiresConfirmation: !inBuilderWorkspace,
      confirmationKind: inBuilderWorkspace ? undefined : "builder",
      confirmationReason: inBuilderWorkspace
        ? undefined
        : "Open a dedicated Builder workspace for this larger build.",
      targetLatencySeconds: 120,
    };
  } else {
    decision = resolveAutoMode(taskIntent, responseContract, artifactSelection, prompt, {
      wantsVision,
      wantsResearch,
    });
  }

  if (decision.requiresConfirmation && confirmationAccepted === true) {
    return {
      ...decision,
      requiresConfirmation: false,
      confirmationKind: undefined,
      confirmationReason: undefined,
      reason: `${decision.reason} User confirmed ${decision.confirmationKind ?? "mode"} escalation.`,
    };
  }

  if (decision.requiresConfirmation && confirmationAccepted === false) {
    return {
      mode: decision.mode,
      effectiveMode: "quick",
      confidence: 90,
      reason: `User chose to stay in Quick Mode instead of ${decision.confirmationKind ?? "escalation"}.`,
      targetLatencySeconds: 20,
      requiresConfirmation: false,
    };
  }

  return decision;
}

export function executionModeToTrace(
  decision: ExecutionModeDecision,
  options?: {
    confirmationShown?: boolean;
    confirmationAccepted?: boolean;
  },
): ExecutionModeTrace {
  return {
    selectedExecutionMode: decision.mode,
    effectiveExecutionMode: decision.effectiveMode,
    modeDecisionReason: decision.reason,
    targetLatencySeconds: decision.targetLatencySeconds,
    confirmationShown: options?.confirmationShown,
    confirmationAccepted: options?.confirmationAccepted,
    confirmationKind: decision.confirmationKind,
  };
}
