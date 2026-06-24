/**
 * IIVO Glass — deterministic meeting sub-type classifier.
 *
 * Classifies a live meeting into one of five archetypes:
 *   sales_external | team_internal | product_review | client_account | general
 *
 * Works entirely from:
 *   1. App name / window title hints (strongest signal)
 *   2. First ~500 words of transcript keyword patterns
 *
 * No LLM. No network calls. Mirrors the pattern in copilotSessionType.ts.
 * Runs once when the transcript reaches MEETING_CLASSIFY_MIN_CHARS (~300 chars),
 * with an optional reclassify pass at MEETING_RECLASSIFY_MIN_CHARS (~1200 chars)
 * if the first result had low confidence.
 *
 * Pure — no electron / fs. Shared across main + renderer + tests.
 */

import {
  MEETING_CLASSIFY_MIN_CHARS,
  MEETING_CLASSIFY_MIN_GAP,
  type MeetingClassification,
  type MeetingSubType,
} from "./meetingIntelligenceTypes.ts";

// ─── App / window title hints ────────────────────────────────────────────────

const APP_HINTS: { subType: MeetingSubType; apps: string[] }[] = [
  {
    subType: "sales_external",
    apps: [
      "salesforce", "hubspot", "pipedrive", "close.io", "apollo",
      "outreach", "salesloft", "gong", "chorus", "copper",
    ],
  },
  {
    subType: "team_internal",
    apps: [
      "slack huddle", "notion", "linear", "jira", "confluence",
      "asana", "monday.com", "basecamp",
    ],
  },
  {
    subType: "product_review",
    apps: [
      "figma", "miro", "productboard", "canny", "mixpanel",
      "amplitude", "pendo", "loom",
    ],
  },
  {
    subType: "client_account",
    apps: [
      "zendesk", "intercom", "freshdesk", "helpscout", "front",
      "gainsight", "totango", "churnzero",
    ],
  },
];

const TITLE_HINTS: { subType: MeetingSubType; titles: string[] }[] = [
  {
    subType: "sales_external",
    titles: [
      "discovery", "demo", "sales call", "intro call", "qualification",
      "negotiation", "proposal", "closing", "prospect", "pitch",
    ],
  },
  {
    subType: "team_internal",
    titles: [
      "standup", "stand-up", "sprint", "retro", "retrospective",
      "planning", "all hands", "team sync", "1:1", "one-on-one",
      "weekly", "check-in", "onboarding call", "offboarding",
    ],
  },
  {
    subType: "product_review",
    titles: [
      "product review", "design review", "roadmap", "feature review",
      "bug bash", "triage", "spec review", "ux review", "product sync",
      "launch review", "milestone", "quarterly review",
    ],
  },
  {
    subType: "client_account",
    titles: [
      "qbr", "quarterly business review", "account review",
      "customer success", "onboarding", "kickoff", "support call",
      "escalation", "client sync", "account sync", "renewal",
    ],
  },
];

// ─── Transcript keyword patterns ─────────────────────────────────────────────

const KEYWORD_HINTS: { subType: MeetingSubType; patterns: RegExp[]; weight: number }[] = [
  // ── Sales external ──────────────────────────────────────────────────────────
  {
    subType: "sales_external",
    weight: 3,
    patterns: [
      /\b(discovery|demo|prospect|pipeline|close|quota|revenue|arr|mrr|deal|opportunity)\b/i,
    ],
  },
  {
    subType: "sales_external",
    weight: 2,
    patterns: [
      /\b(pain point|objection|buying|budget|procurement|champion|decision maker|stakeholder)\b/i,
      /\b(competitor|currently using|switching from|versus|alternative)\b/i,
      /\b(trial|pilot|proposal|contract|sign|onboard them)\b/i,
    ],
  },
  {
    subType: "sales_external",
    weight: 1,
    patterns: [
      /\b(customer|prospect|client|account|lead)\b/i,
      /\b(follow up|next steps|circle back)\b/i,
    ],
  },

  // ── Team internal ───────────────────────────────────────────────────────────
  {
    subType: "team_internal",
    weight: 3,
    patterns: [
      /\b(standup|sprint|retrospective|retro|backlog|velocity|story points|epic|ticket)\b/i,
      /\b(action item|owner|assigned to|who'?s (taking|owning|doing))\b/i,
    ],
  },
  {
    subType: "team_internal",
    weight: 2,
    patterns: [
      /\b(team|eng|engineering|product|design|ops|marketing) (team|sync|update|meeting)\b/i,
      /\b(last week|this week|next week|yesterday|today|agenda|let'?s (go through|review|cover))\b/i,
      /\b(blocker|blocked|waiting on|dependency|ship|deploy|release)\b/i,
    ],
  },
  {
    subType: "team_internal",
    weight: 1,
    patterns: [
      /\b(we need to|let'?s discuss|parking lot|tabled|offline|async)\b/i,
    ],
  },

  // ── Product review ──────────────────────────────────────────────────────────
  {
    subType: "product_review",
    weight: 3,
    patterns: [
      /\b(roadmap|feature (request|flag|gate)|milestone|launch|product (decision|spec|requirement))\b/i,
      /\b(user (feedback|research|testing)|ux|ui|flow|wireframe|prototype|figma)\b/i,
    ],
  },
  {
    subType: "product_review",
    weight: 2,
    patterns: [
      /\b(bug|regression|p0|p1|p2|defect|reproduce|ticket|shipped|released|v\d)\b/i,
      /\b(priorit|deprioritize|cut from scope|scope creep|mvp|phase \d)\b/i,
    ],
  },
  {
    subType: "product_review",
    weight: 1,
    patterns: [
      /\b(build|ship|implement|users? (want|need|asked))\b/i,
    ],
  },

  // ── Client account ──────────────────────────────────────────────────────────
  {
    subType: "client_account",
    weight: 3,
    patterns: [
      /\b(qbr|quarterly business review|account review|renewal|churn|nps|csat|customer success)\b/i,
      /\b(escalation|support ticket|incident|sla|resolution|workaround|issue for (client|customer))\b/i,
    ],
  },
  {
    subType: "client_account",
    weight: 2,
    patterns: [
      /\b(they'?re (unhappy|frustrated|at risk|leaving|churning)|client (said|asked|wants|needs|complained))\b/i,
      /\b(onboarding (call|session)|kickoff|we promised|commitment|deliverable|due to them)\b/i,
    ],
  },
  {
    subType: "client_account",
    weight: 1,
    patterns: [
      /\b(customer|client|account) (is|are|has|have|wants|needs)\b/i,
    ],
  },
];

// ─── Scoring ─────────────────────────────────────────────────────────────────

type ScoreMap = Record<MeetingSubType, number>;

function blankScores(): ScoreMap {
  return {
    sales_external: 0,
    team_internal:  0,
    product_review: 0,
    client_account: 0,
    general:        0,
  };
}

function scoreFromApp(appName: string, scores: ScoreMap): string[] {
  const signals: string[] = [];
  const lower = appName.toLowerCase();
  for (const hint of APP_HINTS) {
    if (hint.apps.some((a) => lower.includes(a))) {
      scores[hint.subType] += 5; // Strong signal
      signals.push(`app:${hint.subType}`);
    }
  }
  return signals;
}

function scoreFromTitle(windowTitle: string, scores: ScoreMap): string[] {
  const signals: string[] = [];
  const lower = windowTitle.toLowerCase();
  for (const hint of TITLE_HINTS) {
    for (const title of hint.titles) {
      if (lower.includes(title)) {
        scores[hint.subType] += 4; // Strong signal
        signals.push(`title:${title}`);
        break; // One title match per sub-type
      }
    }
  }
  return signals;
}

function scoreFromTranscript(transcript: string, scores: ScoreMap): string[] {
  const signals: string[] = [];
  // Use first ~600 words (roughly 3-4 minutes of speech) for classification
  const sample = transcript.slice(0, 2400);

  for (const hint of KEYWORD_HINTS) {
    for (const pattern of hint.patterns) {
      if (pattern.test(sample)) {
        scores[hint.subType] += hint.weight;
        signals.push(`transcript:${hint.subType}(+${hint.weight})`);
      }
    }
  }
  return signals;
}

// ─── Confidence derivation ───────────────────────────────────────────────────

function deriveConfidence(scores: ScoreMap, winner: MeetingSubType): number {
  const sorted = (Object.entries(scores) as [MeetingSubType, number][])
    .sort(([, a], [, b]) => b - a);

  const topScore = sorted[0][1];
  const secondScore = sorted[1]?.[1] ?? 0;

  if (topScore === 0) return 0;

  const gap = topScore - secondScore;
  const gapRatio = gap / Math.max(topScore, 1);

  // Confidence is a blend of absolute score and gap ratio
  const raw = Math.min(1, (topScore / 12) * 0.5 + gapRatio * 0.5);
  return Math.round(raw * 100) / 100;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface MeetingClassifierInput {
  transcript: string;
  appName?: string;
  windowTitle?: string;
}

/**
 * Classify a meeting from transcript + context signals.
 *
 * Returns `null` if the transcript is too short to classify yet
 * (below MEETING_CLASSIFY_MIN_CHARS).
 *
 * Returns a classification with subType "general" when no archetype
 * scores above the minimum gap threshold.
 */
export function classifyMeeting(
  input: MeetingClassifierInput,
): MeetingClassification | null {
  const transcript = (input.transcript ?? "").trim();

  if (transcript.length < MEETING_CLASSIFY_MIN_CHARS) return null;

  const scores = blankScores();
  const signals: string[] = [];

  if (input.appName) {
    signals.push(...scoreFromApp(input.appName, scores));
  }
  if (input.windowTitle) {
    signals.push(...scoreFromTitle(input.windowTitle, scores));
  }
  signals.push(...scoreFromTranscript(transcript, scores));

  // Find the winner
  const sorted = (Object.entries(scores) as [MeetingSubType, number][])
    .filter(([type]) => type !== "general")
    .sort(([, a], [, b]) => b - a);

  const topType = sorted[0]?.[0] ?? "general";
  const topScore = sorted[0]?.[1] ?? 0;
  const secondScore = sorted[1]?.[1] ?? 0;
  const gap = topScore - secondScore;

  // Fall through to general when scores are too close or all zero
  const subType: MeetingSubType =
    topScore > 0 && gap >= MEETING_CLASSIFY_MIN_GAP ? topType : "general";

  const confidence = deriveConfidence(scores, subType);

  return {
    subType,
    confidence,
    signals,
    classifiedAt: Date.now(),
    manualOverride: false,
    scores,
  };
}

/**
 * Apply a manual override from the user ("Change type" in the panel).
 * Marks the classification as manually overridden so it won't be re-run.
 */
export function applyMeetingTypeOverride(
  current: MeetingClassification | null,
  subType: MeetingSubType,
): MeetingClassification {
  return {
    subType,
    confidence: 1.0,
    signals: ["manual_override"],
    classifiedAt: Date.now(),
    manualOverride: true,
    scores: current?.scores ?? {
      sales_external: 0,
      team_internal:  0,
      product_review: 0,
      client_account: 0,
      general:        0,
    },
  };
}

/**
 * True when the transcript has grown enough to attempt reclassification.
 * Only runs if: first classification was low confidence AND not manually overridden
 * AND reclassify hasn't been attempted yet.
 */
export function shouldReclassify(
  classification: MeetingClassification,
  transcriptLengthAtClassification: number,
  currentTranscriptLength: number,
  reclassifyAttempted: boolean,
): boolean {
  if (classification.manualOverride) return false;
  if (reclassifyAttempted) return false;
  if (classification.confidence >= 0.6) return false;
  return currentTranscriptLength >= transcriptLengthAtClassification + 900;
}
