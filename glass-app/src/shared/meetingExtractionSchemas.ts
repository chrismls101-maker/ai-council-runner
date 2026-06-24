/**
 * IIVO Glass — Meeting Intelligence extraction schemas.
 *
 * Each meeting sub-type has a schema that defines:
 *   - Which moment types to extract
 *   - Keyword patterns that trigger each moment type
 *   - Which signals to ignore (noise reduction)
 *   - Report section labels specific to that type
 *
 * Pure — no AI calls. Deterministic regex-based extraction.
 * Mirrors the pattern in meetingIntelligence.ts and salesActiveCoaching.ts.
 */

import type { MeetingMomentType, MeetingSubType } from "./meetingIntelligenceTypes.ts";

// ─── Schema type ─────────────────────────────────────────────────────────────

export interface MomentPattern {
  type: MeetingMomentType;
  patterns: RegExp[];
  /** If true, sentence must also NOT match any of the exclude patterns. */
  excludePatterns?: RegExp[];
}

export interface MeetingExtractionSchema {
  subType: MeetingSubType;
  /** Moment types this schema actively extracts (ordered by priority). */
  activeTypes: MeetingMomentType[];
  /** Pattern groups per moment type. */
  momentPatterns: MomentPattern[];
  /** Report section labels (overrides generic labels for this sub-type). */
  reportSectionLabels: Partial<Record<MeetingMomentType, string>>;
  /**
   * Strings shown in the live panel "Tracking:" status line.
   * Short, comma-separated list of what IIVO is listening for.
   */
  trackingLabel: string;
}

/**
 * A raw extracted moment — the common shape returned by both the AI extraction
 * pass and the regex fallback. `owner` and `deadline` are optional and only
 * populated by the AI path.
 */
export interface ExtractedMomentRaw {
  type: MeetingMomentType;
  content: string;
  owner?: string;
  deadline?: string;
}

// ─── Shared base patterns (all meeting types) ────────────────────────────────

const BASE_DECISION_PATTERNS: RegExp[] = [
  /\b(decided|decision|agreed|approved|green[- ]?light|we'?ll go with|going with|chose|locked in|signed off|confirmed|settled on|let'?s go with|we'?re going)\b/i,
];

const BASE_ACTION_PATTERNS: RegExp[] = [
  /\b(action item|will (own|handle|take|ship|send|draft|prepare|set up|schedule|write|build|fix|create|review|update|check|reach out|follow up)|needs? to|need to|to[- ]do|assigned to|owner[:\s])\b/i,
];

const BASE_BLOCKER_PATTERNS: RegExp[] = [
  /\b(blocked|blocker|waiting on|stuck|can'?t proceed|dependency on|held up|on hold|paused|not unblocked|waiting for)\b/i,
];

const BASE_RISK_PATTERNS: RegExp[] = [
  /\b(risk|at risk|concern|worried|might fail|danger|exposure|slip|jeopardy|could break|vulnerable|fragile|warning)\b/i,
];

const BASE_OPEN_QUESTION_PATTERNS: RegExp[] = [
  /\b(open question|unclear|need to confirm|tbd|to be decided|still deciding|not sure (yet|if|whether)|unknown|needs? (more )?clarification|unresolved)\b/i,
];

const BASE_FOLLOWUP_PATTERNS: RegExp[] = [
  /\b(follow[- ]?up|circle back|reconnect|ping|loop back|check in|get back to|i'?ll send|let'?s sync|schedule a|set up a|book a)\b/i,
];

// ─── Sales external schema ───────────────────────────────────────────────────

const SALES_CUSTOMER_SIGNAL_PATTERNS: RegExp[] = [
  // Pain
  /\b(pain|struggling|frustrated|problem|issue|challenge|bottleneck|slow|manual|waste|hate|broken|costing us|too (long|slow|expensive|complex|hard))\b/i,
  // Objection
  /\b(too expensive|pricing|budget concern|not sure|hesitant|on the fence|need to think|risk|security concern|compliance|procurement)\b/i,
  // Buying signal
  /\b(interested|sounds good|makes sense|let'?s move|when can we|next step|pilot|trial|roll out|implement|sign up|move forward)\b/i,
  // Competitor mention
  /\b(competitor|also looking at|versus|vs\.?|compared to|switching from|currently using|already have)\b/i,
];

const SALES_DEAL_SIGNAL_PATTERNS: RegExp[] = [
  // Budget / Authority / Need / Timeline
  /\b(budget|approved|allocated|q[1-4]|this quarter|next quarter|fiscal|by (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|end of (month|quarter|year)|deadline|must have by)\b/i,
  /\b(ceo|cto|cfo|vp|director|head of|decision maker|my boss|stakeholder|sign off|get approval|legal review|procurement)\b/i,
  /\b(we need|must have|priority for us|top of mind|critical for|main goal)\b/i,
  /\b(stalled|no response|ghost|champion left|deal frozen|pushed back|lost to|competitor won)\b/i,
];

export const SALES_EXTERNAL_SCHEMA: MeetingExtractionSchema = {
  subType: "sales_external",
  activeTypes: [
    "deal_signal",
    "customer_signal",
    "action_item",
    "risk",
    "open_question",
    "follow_up",
    "decision",
    "blocker",
  ],
  momentPatterns: [
    {
      type: "deal_signal",
      patterns: SALES_DEAL_SIGNAL_PATTERNS,
    },
    {
      type: "customer_signal",
      patterns: SALES_CUSTOMER_SIGNAL_PATTERNS,
    },
    {
      type: "action_item",
      patterns: BASE_ACTION_PATTERNS,
    },
    {
      type: "risk",
      patterns: BASE_RISK_PATTERNS,
    },
    {
      type: "open_question",
      patterns: BASE_OPEN_QUESTION_PATTERNS,
      excludePatterns: [
        // Generic questions that don't indicate an open business item
        /^(how are you|what do you|can you tell me|do you have)/i,
      ],
    },
    {
      type: "follow_up",
      patterns: BASE_FOLLOWUP_PATTERNS,
    },
    {
      type: "decision",
      patterns: BASE_DECISION_PATTERNS,
    },
    {
      type: "blocker",
      patterns: BASE_BLOCKER_PATTERNS,
    },
  ],
  reportSectionLabels: {
    deal_signal:     "Deal Signals (Budget · Authority · Timeline)",
    customer_signal: "Customer Signals (Pain · Objections · Buying Signals)",
    action_item:     "Next Steps",
    risk:            "Deal Risks",
    open_question:   "Open Questions",
    follow_up:       "Follow-Up Items",
    decision:        "Agreements Reached",
    blocker:         "Blockers",
  },
  trackingLabel: "pain points, objections, buying signals, next steps",
};

// ─── Team internal schema ────────────────────────────────────────────────────

export const TEAM_INTERNAL_SCHEMA: MeetingExtractionSchema = {
  subType: "team_internal",
  activeTypes: [
    "decision",
    "action_item",
    "blocker",
    "risk",
    "open_question",
    "follow_up",
  ],
  momentPatterns: [
    {
      type: "decision",
      patterns: BASE_DECISION_PATTERNS,
    },
    {
      type: "action_item",
      patterns: BASE_ACTION_PATTERNS,
    },
    {
      type: "blocker",
      patterns: BASE_BLOCKER_PATTERNS,
    },
    {
      type: "risk",
      patterns: BASE_RISK_PATTERNS,
    },
    {
      type: "open_question",
      patterns: [
        ...BASE_OPEN_QUESTION_PATTERNS,
        // Team-specific: parking lot items, things to revisit
        /\b(parking lot|table (that|this|it)|revisit|come back to|offline|async|not today)\b/i,
      ],
    },
    {
      type: "follow_up",
      patterns: BASE_FOLLOWUP_PATTERNS,
    },
  ],
  reportSectionLabels: {
    decision:      "Decisions Made",
    action_item:   "Action Items",
    blocker:       "Blockers",
    risk:          "Risks",
    open_question: "Open Questions",
    follow_up:     "Follow-Up Needed",
  },
  trackingLabel: "decisions, owners, blockers, open questions",
};

// ─── Product review schema ───────────────────────────────────────────────────

const PRODUCT_FEEDBACK_PATTERNS: RegExp[] = [
  // Feature requests
  /\b(feature request|would be great if|users want|customers are asking|should (support|handle|allow)|add (a |the |support for)|missing|gap)\b/i,
  // Bug / issue
  /\b(bug|regression|broken|not working|failing|crash|error|defect|reproduce|reported by|ticket)\b/i,
  // UX feedback
  /\b(confusing|hard to use|friction|ux|ui|redesign|flows|users (are|get) (confused|lost)|onboarding|drop.?off)\b/i,
  // Priority / roadmap
  /\b(priorit|deprioritize|cut from|roadmap|v\d|milestone|ship by|launch|release|p0|p1|p2)\b/i,
];

export const PRODUCT_REVIEW_SCHEMA: MeetingExtractionSchema = {
  subType: "product_review",
  activeTypes: [
    "decision",
    "product_feedback",
    "action_item",
    "risk",
    "open_question",
    "follow_up",
    "blocker",
  ],
  momentPatterns: [
    {
      type: "decision",
      patterns: BASE_DECISION_PATTERNS,
    },
    {
      type: "product_feedback",
      patterns: PRODUCT_FEEDBACK_PATTERNS,
    },
    {
      type: "action_item",
      patterns: BASE_ACTION_PATTERNS,
    },
    {
      type: "risk",
      patterns: [
        ...BASE_RISK_PATTERNS,
        /\b(scope creep|deadline at risk|tech debt|breaking change|backwards compat|performance issue)\b/i,
      ],
    },
    {
      type: "open_question",
      patterns: BASE_OPEN_QUESTION_PATTERNS,
    },
    {
      type: "follow_up",
      patterns: BASE_FOLLOWUP_PATTERNS,
    },
    {
      type: "blocker",
      patterns: BASE_BLOCKER_PATTERNS,
    },
  ],
  reportSectionLabels: {
    decision:         "Product Decisions",
    product_feedback: "Feedback & Requests",
    action_item:      "Action Items",
    risk:             "Risks",
    open_question:    "Open Questions",
    follow_up:        "Follow-Up Needed",
    blocker:          "Blockers",
  },
  trackingLabel: "product decisions, feature requests, bugs, priorities",
};

// ─── Client account schema ───────────────────────────────────────────────────

const CLIENT_COMMITMENT_PATTERNS: RegExp[] = [
  // Promises to customer — we'll / I'll verb
  /\b(we'?ll (send|share|deliver|fix|update|get back|have|have it|ship|deploy|resolve|address|make sure)|i'?ll (send|take care|look into|escalate|prioritize|fix|check|get you|make sure|have))\b/i,
  // Deadline commitments — "by (next) Friday" etc.
  /\bby (next |end of )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|eow|end of week|end of month|next week)\b/i,
  // Customer requests / expectations
  /\b(expecting|they (want|need|asked for)|customer (wants|needs|expects|requested)|they'?re (waiting|expecting|relying))\b/i,
];

export const CLIENT_ACCOUNT_SCHEMA: MeetingExtractionSchema = {
  subType: "client_account",
  activeTypes: [
    "commitment",
    "risk",
    "action_item",
    "open_question",
    "follow_up",
    "decision",
    "blocker",
  ],
  momentPatterns: [
    {
      type: "commitment",
      patterns: CLIENT_COMMITMENT_PATTERNS,
    },
    {
      type: "risk",
      patterns: [
        ...BASE_RISK_PATTERNS,
        /\b(churn|renewal|unhappy|frustrated|escalat|at risk|not satisfied|dissatisfied|cancel|leaving|churning)\b/i,
      ],
    },
    {
      type: "action_item",
      patterns: BASE_ACTION_PATTERNS,
    },
    {
      type: "open_question",
      patterns: BASE_OPEN_QUESTION_PATTERNS,
    },
    {
      type: "follow_up",
      patterns: BASE_FOLLOWUP_PATTERNS,
    },
    {
      type: "decision",
      patterns: BASE_DECISION_PATTERNS,
    },
    {
      type: "blocker",
      patterns: BASE_BLOCKER_PATTERNS,
    },
  ],
  reportSectionLabels: {
    commitment:    "Commitments Made",
    risk:          "Account Risks",
    action_item:   "Action Items",
    open_question: "Open Questions",
    follow_up:     "Follow-Up Needed",
    decision:      "Agreements",
    blocker:       "Blockers",
  },
  trackingLabel: "commitments, account risks, action items",
};

// ─── General fallback schema ─────────────────────────────────────────────────

export const GENERAL_SCHEMA: MeetingExtractionSchema = {
  subType: "general",
  activeTypes: [
    "decision",
    "action_item",
    "risk",
    "blocker",
    "open_question",
    "follow_up",
  ],
  momentPatterns: [
    {
      type: "decision",
      patterns: BASE_DECISION_PATTERNS,
    },
    {
      type: "action_item",
      patterns: BASE_ACTION_PATTERNS,
    },
    {
      type: "risk",
      patterns: BASE_RISK_PATTERNS,
    },
    {
      type: "blocker",
      patterns: BASE_BLOCKER_PATTERNS,
    },
    {
      type: "open_question",
      patterns: BASE_OPEN_QUESTION_PATTERNS,
    },
    {
      type: "follow_up",
      patterns: BASE_FOLLOWUP_PATTERNS,
    },
  ],
  reportSectionLabels: {
    decision:      "Decisions",
    action_item:   "Action Items",
    risk:          "Risks",
    blocker:       "Blockers",
    open_question: "Open Questions",
    follow_up:     "Follow-Up Needed",
  },
  trackingLabel: "decisions, action items, risks, open questions",
};

// ─── Schema registry ─────────────────────────────────────────────────────────

export const MEETING_SCHEMAS: Record<MeetingSubType, MeetingExtractionSchema> = {
  sales_external: SALES_EXTERNAL_SCHEMA,
  team_internal:  TEAM_INTERNAL_SCHEMA,
  product_review: PRODUCT_REVIEW_SCHEMA,
  client_account: CLIENT_ACCOUNT_SCHEMA,
  general:        GENERAL_SCHEMA,
};

export function getMeetingSchema(subType: MeetingSubType): MeetingExtractionSchema {
  return MEETING_SCHEMAS[subType];
}

/**
 * Extract typed moments from a transcript chunk using a schema.
 * Returns de-duped moments, max 6 per type, newest-first priority on content.
 *
 * Called by the extraction engine every ~15s on new transcript delta.
 */
export function extractMomentsFromChunk(
  chunk: string,
  schema: MeetingExtractionSchema,
): ExtractedMomentRaw[] {
  const sentences = chunk
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);

  const results: Array<{ type: MeetingMomentType; content: string }> = [];
  const seen = new Set<string>();

  for (const pattern of schema.momentPatterns) {
    if (!schema.activeTypes.includes(pattern.type)) continue;

    for (const sentence of sentences) {
      const matches = pattern.patterns.some((re) => re.test(sentence));
      if (!matches) continue;

      const excluded = pattern.excludePatterns?.some((re) => re.test(sentence)) ?? false;
      if (excluded) continue;

      const key = `${pattern.type}:${sentence.toLowerCase().slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({ type: pattern.type, content: sentence });
    }
  }

  return results;
}
