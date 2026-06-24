/**
 * IIVO Glass — Meeting Intelligence types.
 *
 * Meeting Intelligence is IIVO's business-decision capture layer for live
 * calls and meetings. It sits above transcription: rather than "what was said"
 * it captures "what was decided, who owns it, what is blocked, and what
 * happens next."
 *
 * The user-facing mode is always "Meetings." Internally, IIVO classifies the
 * meeting sub-type (sales call, team sync, product review, etc.) and applies
 * the correct extraction schema and report format automatically.
 *
 * Pure — no electron / fs / AI calls. Shared across main + renderer + tests.
 */

// ─── Meeting sub-type ────────────────────────────────────────────────────────

/**
 * The five archetypes that cover 90%+ of real meetings.
 *
 * The user never picks this — IIVO classifies it from transcript + app context.
 * A "Change type" override exists in the panel for the rare misclassification.
 */
export type MeetingSubType =
  | "sales_external"   // External call with revenue context (discovery, demo, negotiation)
  | "team_internal"    // Internal sync, standup, sprint planning, retrospective
  | "product_review"   // Feature decisions, roadmap, bug triage, product strategy
  | "client_account"   // Post-sale customer call, account review, support escalation
  | "general";         // Fallback when no archetype is confident

export const MEETING_SUB_TYPE_LABELS: Record<MeetingSubType, string> = {
  sales_external: "Sales Call",
  team_internal:  "Team Meeting",
  product_review: "Product Review",
  client_account: "Client Call",
  general:        "Meeting",
};

/** Displayed in the panel "Detected: X" badge. */
export const MEETING_SUB_TYPE_SHORT_LABELS: Record<MeetingSubType, string> = {
  sales_external: "Sales Call",
  team_internal:  "Team Sync",
  product_review: "Product Review",
  client_account: "Client Call",
  general:        "General Meeting",
};

export const MEETING_SUB_TYPE_ORDER: MeetingSubType[] = [
  "sales_external",
  "team_internal",
  "product_review",
  "client_account",
  "general",
];

// ─── Classification result ───────────────────────────────────────────────────

export interface MeetingClassification {
  subType: MeetingSubType;
  /**
   * Normalised confidence 0..1 derived from signal count and score gap.
   * Not shown to the user — internal only.
   */
  confidence: number;
  /** Which signals fired (for debugging / QA). */
  signals: string[];
  /** Unix ms when classification fired. */
  classifiedAt: number;
  /** True when the user overrode the auto-detected type. */
  manualOverride: boolean;
  /** Raw scores per archetype (for QA / future ML training). */
  scores: Record<MeetingSubType, number>;
}

// ─── Moment types ────────────────────────────────────────────────────────────

/**
 * Typed business moments extracted live from the transcript.
 * Only moment types relevant to the current sub-type are emitted.
 */
export type MeetingMomentType =
  | "decision"          // All types
  | "action_item"       // All types
  | "risk"              // All types
  | "blocker"           // All types
  | "open_question"     // All types
  | "follow_up"         // All types
  | "customer_signal"   // sales_external: pain, buying signal, objection, competitor
  | "commitment"        // client_account: promise made to the customer
  | "product_feedback"  // product_review: feature request, bug, UX issue
  | "deal_signal";      // sales_external: BANT signals (budget, authority, need, timeline)

export const MEETING_MOMENT_TYPE_LABELS: Record<MeetingMomentType, string> = {
  decision:         "Decision",
  action_item:      "Action Item",
  risk:             "Risk",
  blocker:          "Blocker",
  open_question:    "Open Question",
  follow_up:        "Follow-Up",
  customer_signal:  "Customer Signal",
  commitment:       "Commitment",
  product_feedback: "Product Feedback",
  deal_signal:      "Deal Signal",
};

export const MEETING_MOMENT_ICONS: Record<MeetingMomentType, string> = {
  decision:         "✅",
  action_item:      "📌",
  risk:             "⚠️",
  blocker:          "🚧",
  open_question:    "❓",
  follow_up:        "🔁",
  customer_signal:  "💡",
  commitment:       "🤝",
  product_feedback: "🛠",
  deal_signal:      "📊",
};

export interface MeetingMoment {
  id: string;
  type: MeetingMomentType;
  /** Extracted content — the actual sentence or summary. */
  content: string;
  /** Detected owner name, if any. */
  owner?: string;
  /** Detected deadline string, if any. */
  deadline?: string;
  /** Unix ms when this moment was first detected. */
  detectedAt: number;
  /** True when the moment was added manually by the user (not engine-extracted). */
  manualOverride?: boolean;
}

// ─── Report structure ────────────────────────────────────────────────────────

/**
 * Section ordering for each meeting sub-type. The first section in the list
 * is the highest-value and appears at the top of the report.
 */
export const MEETING_REPORT_SECTION_ORDER: Record<MeetingSubType, MeetingMomentType[]> = {
  sales_external: [
    "deal_signal",
    "customer_signal",
    "action_item",
    "risk",
    "open_question",
    "follow_up",
    "decision",
    "blocker",
  ],
  team_internal: [
    "decision",
    "action_item",
    "blocker",
    "risk",
    "open_question",
    "follow_up",
  ],
  product_review: [
    "decision",
    "product_feedback",
    "action_item",
    "risk",
    "open_question",
    "follow_up",
    "blocker",
  ],
  client_account: [
    "commitment",
    "risk",
    "action_item",
    "open_question",
    "follow_up",
    "decision",
    "blocker",
  ],
  general: [
    "decision",
    "action_item",
    "risk",
    "blocker",
    "open_question",
    "follow_up",
  ],
};

// ─── Live intelligence state ─────────────────────────────────────────────────

/**
 * Runtime state for a live meeting intelligence session.
 * Stored in GlassState and updated as the transcript grows.
 */
export interface MeetingIntelligenceState {
  /** Null until classification fires (~90s / ~500 words). */
  classification: MeetingClassification | null;
  /** Typed moments extracted so far, newest last. */
  moments: MeetingMoment[];
  /**
   * Approximate transcript length when classification fired.
   * Used to decide whether to reclassify at the 5-min mark if confidence was low.
   */
  transcriptLengthAtClassification?: number;
  /**
   * Whether a reclassification pass has been attempted (only one retry allowed).
   */
  reclassifyAttempted?: boolean;
  /** Unix ms of the last extraction pass. */
  lastExtractionAt?: number;
  /**
   * Transcript length (chars) at the time of the last extraction pass.
   * The engine uses this to compute the delta chunk for the next pass,
   * avoiding re-processing text that was already extracted.
   */
  lastExtractionTranscriptLen?: number;
}

export const MEETING_INTELLIGENCE_INITIAL_STATE: MeetingIntelligenceState = {
  classification: null,
  moments: [],
};

// ─── Classification thresholds ───────────────────────────────────────────────

/** Minimum transcript length (chars) before classification is attempted. */
export const MEETING_CLASSIFY_MIN_CHARS = 300;

/** Transcript length (chars) for the reclassification retry. */
export const MEETING_RECLASSIFY_MIN_CHARS = 1200;

/**
 * Score gap required between the top type and second-best before we trust
 * the classification. Below this gap the result falls through to "general".
 * Gap of 1 is sufficient — even a single distinctive signal separates types.
 */
export const MEETING_CLASSIFY_MIN_GAP = 1;

/** Extraction pass interval — same cadence as listenLiveNotes. */
export const MEETING_EXTRACTION_INTERVAL_MS = 15_000;

/** Minimum new transcript chars before running another extraction pass. */
export const MEETING_EXTRACTION_MIN_DELTA_CHARS = 120;
