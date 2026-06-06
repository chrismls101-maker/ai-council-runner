/**
 * Listen mode — moment detection, lifecycle, and dynamic thought generation.
 *
 * Evaluates recent system-audio transcript and maintains a rolling set of
 * meaningful moments. Pure — no electron / fs.
 */

import { isDuplicateText } from "./sessionIntelligence.ts";
import { withMomentMaturity } from "./listenMomentMaturity.ts";
import type { MediaContext } from "./mediaContextTypes.ts";
import { buildListenProactiveThought } from "./listenModePersona.ts";
import type { ListenSegmentKind } from "./listenSegmentClassifier.ts";
import type {
  ListenMoment,
  ListenMomentImportance,
  ListenMomentStatus,
  ListenMomentType,
} from "./listenMomentTypes.ts";

export interface ListenMomentEvalInput {
  newText: string;
  recentTranscript: string;
  existingMoments: ListenMoment[];
  nowMs?: number;
  idFactory?: () => string;
  segmentKind?: ListenSegmentKind;
  userGoalContext?: string;
  mediaContext?: MediaContext | null;
}

interface MomentPattern {
  type: ListenMomentType;
  re: RegExp;
  importance: ListenMomentImportance;
  baseConfidence: number;
}

const PATTERNS: MomentPattern[] = [
  { type: "framework", re: /\b(framework|model|process|methodology|step \d|phase \d|playbook)\b/i, importance: "high", baseConfidence: 0.78 },
  { type: "tactic", re: /\b(tactic|strategy|approach|technique|hack|tip)\b/i, importance: "medium", baseConfidence: 0.72 },
  { type: "warning", re: /\b(warning|caution|don'?t|avoid|mistake|risk|pitfall|trap)\b/i, importance: "high", baseConfidence: 0.8 },
  { type: "claim", re: /\b(claim|believe|think|argue|the reason|because|therefore)\b/i, importance: "medium", baseConfidence: 0.68 },
  { type: "number_stat", re: /\b(\d{1,3}(?:,\d{3})*(?:\.\d+)?%|\$\d|\d+x|\d+\s*(million|billion|percent))\b/i, importance: "medium", baseConfidence: 0.75 },
  { type: "business_opportunity", re: /\b(opportunity|market|revenue|growth|moat|distribution|positioning)\b/i, importance: "high", baseConfidence: 0.74 },
  { type: "sales_tactic", re: /\b(objection|qualify|discovery|roi|pain point|close|pipeline|demo)\b/i, importance: "high", baseConfidence: 0.76 },
  { type: "implementation_idea", re: /\b(implement|build|automate|integrate|cursor|prompt|workflow|ship)\b/i, importance: "medium", baseConfidence: 0.7 },
  { type: "confusing_concept", re: /\b(complex|confus|hard to|unclear|what is|how does)\b/i, importance: "medium", baseConfidence: 0.65 },
  { type: "quote", re: /^["'""].{8,120}["'""]$/i, importance: "medium", baseConfidence: 0.7 },
  { type: "action_step", re: /\b(action item|next step|you should|do this|start by|first,|then,)\b/i, importance: "high", baseConfidence: 0.77 },
  { type: "prompt_idea", re: /\b(prompt|template|script|checklist|copy)\b/i, importance: "medium", baseConfidence: 0.71 },
  { type: "key_idea", re: /\b(key idea|takeaway|important|main point|remember|insight)\b/i, importance: "high", baseConfidence: 0.82 },
  { type: "example", re: /\b(for example|for instance|case study|story|when we)\b/i, importance: "medium", baseConfidence: 0.66 },
  { type: "entity_mention", re: /\b(openai|cursor|github|notion|figma|hubspot|salesforce|stripe|vercel|anthropic)\b/i, importance: "low", baseConfidence: 0.6 },
];

const TYPE_RANK: Record<ListenMomentType, number> = {
  key_idea: 9,
  warning: 8,
  framework: 8,
  sales_tactic: 7,
  business_opportunity: 7,
  action_step: 7,
  tactic: 6,
  implementation_idea: 6,
  claim: 5,
  number_stat: 5,
  prompt_idea: 5,
  confusing_concept: 4,
  quote: 4,
  example: 3,
  entity_mention: 2,
};

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

function shortSummary(text: string, max = 100): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function findMatchingMoment(
  anchor: string,
  moments: ListenMoment[],
): ListenMoment | undefined {
  return moments.find(
    (m) =>
      m.status !== "dismissed" &&
      m.status !== "stale" &&
      (m.transcriptAnchors.some((a) => isDuplicateText(a, anchor)) ||
        isDuplicateText(m.summary, anchor)),
  );
}

/** Generate a contextual IIVO thought from moment type + anchor text. */
export function generateListenThought(
  moment: Pick<ListenMoment, "type" | "transcriptAnchors" | "summary">,
  ctx: { userGoalContext?: string; mediaContext?: MediaContext | null } = {},
): {
  suggestedThought: string;
  suggestedQuestion?: string;
  suggestedAction?: string;
  reasonSelected: string;
} {
  const grounded = buildListenProactiveThought({
    moment,
    ctx: { userGoalContext: ctx.userGoalContext, mediaContext: ctx.mediaContext },
  });
  return {
    suggestedThought: grounded.suggestedThought,
    reasonSelected: grounded.reasonSelected,
  };
}

function detectCandidates(text: string): Array<{
  type: ListenMomentType;
  anchor: string;
  importance: ListenMomentImportance;
  confidence: number;
}> {
  const out: Array<{
    type: ListenMomentType;
    anchor: string;
    importance: ListenMomentImportance;
    confidence: number;
  }> = [];
  for (const sentence of splitSentences(text).slice(-8)) {
    for (const pat of PATTERNS) {
      if (pat.re.test(sentence)) {
        out.push({
          type: pat.type,
          anchor: sentence,
          importance: pat.importance,
          confidence: pat.baseConfidence,
        });
        break;
      }
    }
  }
  return out;
}

function nextStatus(
  moment: ListenMoment,
  anchorLen: number,
  topicMovedOn: boolean,
  nowIso: string,
): ListenMomentStatus {
  if (moment.status === "surfaced" || moment.status === "dismissed" || moment.status === "saved_silently") {
    return moment.status;
  }
  if (topicMovedOn) return "stale";
  if (anchorLen < 40) return "pending";
  if (anchorLen < 80 || moment.confidence < 0.7) return "developing";
  return "ready";
}

/** Evaluate new transcript text and update moment lifecycle. */
export function evaluateListenMoments(input: ListenMomentEvalInput): ListenMoment[] {
  const nowMs = input.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const idFactory = input.idFactory ?? (() => `lm-${nowMs}-${Math.random().toString(36).slice(2, 8)}`);
  const moments = [...input.existingMoments];
  const combined = `${input.recentTranscript} ${input.newText}`.trim();
  const recentTail = combined.slice(-600);

  for (const candidate of detectCandidates(input.newText)) {
    const existing = findMatchingMoment(candidate.anchor, moments);
    const generated = generateListenThought(
      {
        type: candidate.type,
        transcriptAnchors: [candidate.anchor],
        summary: shortSummary(candidate.anchor),
      },
      { userGoalContext: input.userGoalContext, mediaContext: input.mediaContext },
    );

    if (existing) {
      existing.lastUpdatedAt = nowIso;
      existing.confidence = Math.min(0.95, existing.confidence + 0.05);
      if (!existing.transcriptAnchors.includes(candidate.anchor)) {
        existing.transcriptAnchors.push(candidate.anchor);
      }
      existing.suggestedThought = generated.suggestedThought;
      existing.suggestedQuestion = generated.suggestedQuestion;
      existing.reasonSelected = generated.reasonSelected;
      if (existing.suggestedThought !== generated.suggestedThought) {
        existing.updatedSuggestedThought = generated.suggestedThought;
      }
      existing.status = nextStatus(existing, candidate.anchor.length, false, nowIso);
    } else {
      moments.push({
        id: idFactory(),
        type: candidate.type,
        summary: shortSummary(candidate.anchor),
        transcriptAnchors: [candidate.anchor],
        firstSeenAt: nowIso,
        lastUpdatedAt: nowIso,
        confidence: candidate.confidence,
        importance: candidate.importance,
        suggestedThought: generated.suggestedThought,
        suggestedQuestion: generated.suggestedQuestion,
        reasonSelected: generated.reasonSelected,
        status: candidate.anchor.length >= 80 ? "ready" : "developing",
      });
    }
  }

  const segmentKind = input.segmentKind ?? "content";

  for (const moment of moments) {
    if (moment.status === "surfaced" || moment.status === "dismissed" || moment.status === "saved_silently") {
      continue;
    }
    const anchor = moment.transcriptAnchors[0] ?? "";
    const topicMovedOn =
      anchor.length > 20 &&
      !recentTail.toLowerCase().includes(anchor.slice(0, 24).toLowerCase()) &&
      nowMs - Date.parse(moment.lastUpdatedAt) > 120_000;
    if (topicMovedOn) {
      moment.topicShifted = true;
      moment.staleBecause = "Topic moved on — saved for report instead of interrupting.";
    }
    moment.status = nextStatus(moment, anchor.length, topicMovedOn, nowIso);
  }

  return moments
    .map((m) => withMomentMaturity(m, nowMs, segmentKind))
    .sort((a, b) => (TYPE_RANK[b.type] ?? 0) - (TYPE_RANK[a.type] ?? 0))
    .slice(0, 40);
}

/** Pick the best moment eligible for surfacing evaluation. */
export function pickBestListenMomentForSurface(moments: ListenMoment[]): ListenMoment | null {
  const pool = moments.filter(
    (m) => m.status === "ready" && m.isActionableNow === true && m.isStillDeveloping !== true,
  );
  if (!pool.length) return null;
  const sorted = [...pool].sort((a, b) => {
    const imp = { high: 3, medium: 2, low: 1 };
    return imp[b.importance] - imp[a.importance] || b.confidence - a.confidence;
  });
  return sorted[0] ?? null;
}

export function markListenMomentStatus(
  moments: ListenMoment[],
  momentId: string,
  status: ListenMomentStatus,
  extra?: Partial<ListenMoment>,
): ListenMoment[] {
  return moments.map((m) => (m.id === momentId ? { ...m, ...extra, status } : m));
}
