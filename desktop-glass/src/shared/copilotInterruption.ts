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
import type { GlassCopilotSessionType } from "./copilotSessionType.ts";
import { isDuplicateText } from "./sessionIntelligence.ts";

export const MIN_INTERVENTION_GAP_MS = 60_000;

/** Context that flavors card copy/buttons by what the user is doing. */
export interface InterventionBuildContext {
  sessionType: GlassCopilotSessionType;
  appName?: string;
}

const DEFAULT_BUILD_CONTEXT: InterventionBuildContext = {
  sessionType: "general_workflow",
};

function appIsCursor(appName: string | undefined): boolean {
  return (appName ?? "").toLowerCase().includes("cursor");
}

/** Human label for the primary "turn this into X" output, by session type. */
function outputActionLabel(sessionType: GlassCopilotSessionType): string {
  switch (sessionType) {
    case "coding_building":
      return "turn it into a prompt for your AI tool";
    case "video_learning":
      return "turn it into an action plan";
    case "research":
      return "save it as research notes";
    case "meeting_call":
      return "add it to your follow-ups";
    case "business_strategy":
      return "break it down into pros and cons";
    case "sales_review":
      return "draft an outreach angle";
    case "studying":
      return "make study notes from it";
    default:
      return "turn it into next steps";
  }
}

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
  /**
   * Effective minimum gap (ms) since the last intervention. The governor
   * raises this above MIN_INTERVENTION_GAP_MS after repeated dismissals.
   */
  minGapMs?: number;
}

function modeAllowsCards(config: GlassCopilotConfig): boolean {
  return config.mode === "coaching" || config.mode === "diagnostic";
}

function gapSatisfied(ctx: InterruptionContext): boolean {
  if (ctx.lastInterventionMs == null) return true;
  return ctx.nowMs - ctx.lastInterventionMs >= (ctx.minGapMs ?? MIN_INTERVENTION_GAP_MS);
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

function cardCopyFor(insight: GlassCopilotInsight, ctx: InterventionBuildContext): CardCopy {
  const promptLabel = appIsCursor(ctx.appName) ? "Create Cursor prompt" : "Create AI prompt";
  switch (insight.type) {
    case "cursor_prompt_candidate":
      return {
        title: "I found a useful idea.",
        body: `Want a prompt for your AI tool? “${insight.title}”`,
        buttons: [
          { action: "create-prompt", label: promptLabel, primary: true },
          { action: "later", label: "Later" },
          { action: "dismiss", label: "Dismiss" },
        ],
      };
    case "action":
      return {
        title: "This sounds like an action item.",
        body: `Want me to ${outputActionLabel(ctx.sessionType)}? “${insight.title}”`,
        buttons: [
          { action: "turn-into-action", label: "Turn into action", primary: true },
          { action: "save", label: "Save" },
          { action: "dismiss", label: "Dismiss" },
        ],
      };
    case "risk":
      return {
        title:
          ctx.sessionType === "coding_building"
            ? "You may be stuck on this."
            : "This sounds like a risk.",
        body: `Want me to diagnose it? “${insight.title}”`,
        buttons: [
          { action: "diagnose", label: "Diagnose", primary: true },
          { action: "dismiss", label: "Ignore" },
        ],
      };
    case "opportunity":
      return {
        title: "I spotted an opportunity.",
        body: `Want me to ${outputActionLabel(ctx.sessionType)}? “${insight.title}”`,
        buttons: [
          { action: "turn-into-action", label: "Turn into action", primary: true },
          { action: "save", label: "Save" },
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
  buildContext: InterventionBuildContext = DEFAULT_BUILD_CONTEXT,
): GlassCopilotIntervention {
  const copy = cardCopyFor(insight, buildContext);
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
