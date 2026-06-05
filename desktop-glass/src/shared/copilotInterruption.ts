/**
 * Session Copilot — interruption rules + overlay card builders.
 *
 * Copilot must stay quiet. A card is only shown when ALL hold:
 *   - mode is coaching or diagnostic (passive/off never interrupt)
 *   - overlay suggestions are enabled and not muted
 *   - insight importance is "high"
 *   - insight type is action / risk / opportunity / cursor_prompt_candidate
 *   - a similar card was not recently shown (dedupe)
 *   - at least 60s since the last intervention
 *
 * Pure — no electron / fs.
 */

import {
  type GlassCopilotCardButton,
  type GlassCopilotConfig,
  type GlassCopilotInsight,
  type GlassCopilotInsightType,
  type GlassCopilotIntervention,
  type GlassCopilotInterventionKind,
} from "./copilotTypes.ts";
import { isDuplicateText } from "./sessionIntelligence.ts";

export const MIN_INTERVENTION_GAP_MS = 60_000;

/** Insight types eligible to surface as an overlay suggestion card. */
export const INTERRUPTION_INSIGHT_TYPES = new Set<GlassCopilotInsightType>([
  "action",
  "risk",
  "opportunity",
  "cursor_prompt_candidate",
]);

export interface InterruptionContext {
  config: GlassCopilotConfig;
  nowMs: number;
  lastInterventionMs?: number;
  /** Titles/texts of recently shown cards, for dedupe. */
  recentShownTexts: string[];
}

function modeAllowsCards(config: GlassCopilotConfig): boolean {
  return config.mode === "coaching" || config.mode === "diagnostic";
}

function gapSatisfied(ctx: InterruptionContext): boolean {
  if (ctx.lastInterventionMs == null) return true;
  return ctx.nowMs - ctx.lastInterventionMs >= MIN_INTERVENTION_GAP_MS;
}

function recentlyShown(ctx: InterruptionContext, insight: GlassCopilotInsight): boolean {
  return ctx.recentShownTexts.some((t) => isDuplicateText(t, insight.text));
}

/** Decide whether a single insight is worthy of an overlay card right now. */
export function shouldShowOverlayCard(
  insight: GlassCopilotInsight,
  ctx: InterruptionContext,
): boolean {
  const { config } = ctx;
  if (!modeAllowsCards(config)) return false;
  if (!config.showOverlaySuggestions) return false;
  if (config.muteSuggestions) return false;
  if (insight.importance !== "high") return false;
  if (!INTERRUPTION_INSIGHT_TYPES.has(insight.type)) return false;
  if (insight.userDecision !== "pending") return false;
  if (recentlyShown(ctx, insight)) return false;
  if (!gapSatisfied(ctx)) return false;
  return true;
}

/** From a batch of fresh insights, pick the single best one to surface (if any). */
export function pickInterventionInsight(
  insights: GlassCopilotInsight[],
  ctx: InterruptionContext,
): GlassCopilotInsight | null {
  const eligible = insights.filter((i) => shouldShowOverlayCard(i, ctx));
  if (eligible.length === 0) return null;
  // Prefer cursor_prompt_candidate > risk > opportunity > action, then confidence.
  const rank: Record<string, number> = {
    cursor_prompt_candidate: 4,
    risk: 3,
    opportunity: 2,
    action: 1,
  };
  return [...eligible].sort((a, b) => {
    const r = (rank[b.type] ?? 0) - (rank[a.type] ?? 0);
    if (r !== 0) return r;
    return b.confidence - a.confidence;
  })[0];
}

function interventionKindFor(type: GlassCopilotInsightType): GlassCopilotInterventionKind {
  switch (type) {
    case "cursor_prompt_candidate":
      return "cursor_prompt";
    case "risk":
      return "diagnose";
    case "action":
    case "opportunity":
      return "action";
    default:
      return "generic";
  }
}

interface CardCopy {
  title: string;
  body: string;
  buttons: GlassCopilotCardButton[];
}

function cardCopyFor(insight: GlassCopilotInsight): CardCopy {
  switch (insight.type) {
    case "cursor_prompt_candidate":
      return {
        title: "I found a useful idea.",
        body: `Turn it into a Cursor prompt? “${insight.title}”`,
        buttons: [
          { action: "yes", label: "Yes", primary: true },
          { action: "later", label: "Later" },
          { action: "dismiss", label: "Dismiss" },
        ],
      };
    case "action":
      return {
        title: "This sounds like an action item.",
        body: `Save it? “${insight.title}”`,
        buttons: [
          { action: "save", label: "Save", primary: true },
          { action: "dismiss", label: "Dismiss" },
        ],
      };
    case "risk":
      return {
        title: "You may be stuck on this.",
        body: `Diagnose it? “${insight.title}”`,
        buttons: [
          { action: "diagnose", label: "Diagnose", primary: true },
          { action: "dismiss", label: "Ignore" },
        ],
      };
    case "opportunity":
      return {
        title: "I spotted an opportunity.",
        body: `Capture it? “${insight.title}”`,
        buttons: [
          { action: "save", label: "Save", primary: true },
          { action: "later", label: "Later" },
          { action: "dismiss", label: "Dismiss" },
        ],
      };
    default:
      return {
        title: "Copilot insight",
        body: insight.title,
        buttons: [
          { action: "save", label: "Save", primary: true },
          { action: "dismiss", label: "Dismiss" },
        ],
      };
  }
}

export function buildInterventionForInsight(
  insight: GlassCopilotInsight,
  deps: { idFactory: () => string; clock: () => string },
): GlassCopilotIntervention {
  const copy = cardCopyFor(insight);
  return {
    id: deps.idFactory(),
    insightId: insight.id,
    kind: interventionKindFor(insight.type),
    title: copy.title,
    body: copy.body,
    buttons: copy.buttons,
    createdAt: deps.clock(),
  };
}

/** A standalone "summary ready" card (no backing insight). */
export function buildSummaryReadyIntervention(deps: {
  idFactory: () => string;
  clock: () => string;
}): GlassCopilotIntervention {
  return {
    id: deps.idFactory(),
    kind: "summary",
    title: "I have a session summary ready.",
    body: "Show now?",
    buttons: [
      { action: "show-summary", label: "Show", primary: true },
      { action: "later", label: "Later" },
    ],
    createdAt: deps.clock(),
  };
}

/** A diagnostic offer card (Diagnostic mode, stuck/error pattern detected). */
export function buildDiagnoseOfferIntervention(
  reason: string,
  deps: { idFactory: () => string; clock: () => string },
): GlassCopilotIntervention {
  return {
    id: deps.idFactory(),
    kind: "diagnose",
    title: "Want me to diagnose what's going wrong?",
    body: reason,
    buttons: [
      { action: "diagnose", label: "Diagnose", primary: true },
      { action: "dismiss", label: "Ignore" },
    ],
    createdAt: deps.clock(),
  };
}
