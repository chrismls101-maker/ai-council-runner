/**
 * IIVO Glass Session Copilot — shared types.
 *
 * Session Copilot is an opt-in mode that observes an *already active* session
 * (transcript + screen context + IIVO commands) and decides when an
 * intervention is useful. It NEVER starts on launch, never records secretly,
 * and stays quiet unless its interruption rules say a card is worth showing.
 *
 * All types here are pure data (no electron / fs) so they are unit-testable.
 */

import type {
  GlassCopilotSessionType,
  GlassCopilotSessionTypeSetting,
} from "./copilotSessionType.ts";

export type GlassCopilotMode = "off" | "passive" | "coaching" | "diagnostic";

export type GlassCopilotReportStyle = "concise" | "detailed";

/**
 * Insight categories the deterministic engine can emit. Superset of the
 * existing GlassInsightType (so candidates from sessionIntelligence map 1:1)
 * plus copilot-specific kinds.
 */
export type GlassCopilotInsightType =
  | "key_idea"
  | "action"
  | "question"
  | "risk"
  | "opportunity"
  | "hypothesis"
  | "memory_candidate"
  | "cursor_prompt_candidate"
  | "summary_note";

export type GlassCopilotImportance = "low" | "medium" | "high";

/** What the user decided about an insight. "later" = kept but card hidden. */
export type GlassCopilotDecision =
  | "pending"
  | "accepted"
  | "dismissed"
  | "saved"
  | "later";

export interface GlassCopilotInsight {
  id: string;
  type: GlassCopilotInsightType;
  title: string;
  text: string;
  /** Where it came from, e.g. "transcript", "screen", "command", "app". */
  source: string;
  /** 0..1 deterministic confidence from cue strength. */
  confidence: number;
  importance: GlassCopilotImportance;
  createdAt: string;
  relatedEventIds: string[];
  suggestedAction?: string;
  userDecision: GlassCopilotDecision;
}

/** Buttons a copilot overlay card can present. */
export type GlassCopilotCardAction =
  | "yes"
  | "no"
  | "later"
  | "save"
  | "diagnose"
  | "show-summary"
  | "turn-into-action"
  | "create-prompt"
  | "summarize-blocker"
  | "create-fix-plan"
  | "save-issue"
  | "dismiss";

export interface GlassCopilotCardButton {
  action: GlassCopilotCardAction;
  label: string;
  /** Primary button gets emphasis styling. */
  primary?: boolean;
}

export type GlassCopilotInterventionKind =
  | "cursor_prompt"
  | "action"
  | "diagnose"
  | "summary"
  | "generic";

export interface GlassCopilotIntervention {
  id: string;
  insightId?: string;
  kind: GlassCopilotInterventionKind;
  title: string;
  body: string;
  buttons: GlassCopilotCardButton[];
  createdAt: string;
  resolvedAt?: string;
  resolvedAction?: GlassCopilotCardAction;
}

export interface GlassCopilotConfig {
  mode: GlassCopilotMode;
  /** Extraction cadence in seconds. Only 60 / 90 / 120 are valid. */
  intervalSec: 60 | 90 | 120;
  /** Master switch for overlay suggestion cards (coaching/diagnostic). */
  showOverlaySuggestions: boolean;
  /** Generate a debrief automatically when the session ends. */
  autoDebriefOnEnd: boolean;
  /** Minutes of system-audio silence before prompting to pause. */
  silenceTimeoutMin: number;
  /** Hard cap on copilot listening duration in minutes. */
  maxListeningMin: number;
  /** When true, copilot never shows suggestion cards (still extracts). */
  muteSuggestions: boolean;
  /** Pin a session type, or "auto" to detect from context. */
  sessionType: GlassCopilotSessionTypeSetting;
  /** Debrief verbosity. */
  reportStyle: GlassCopilotReportStyle;
}

export interface GlassCopilotDebriefSection {
  heading: string;
  items: string[];
}

export interface GlassCopilotDebrief {
  id: string;
  sessionId: string;
  createdAt: string;
  sections: GlassCopilotDebriefSection[];
  markdown: string;
  /** True when a direct (non-Council) AI pass enriched the debrief. */
  aiEnhanced: boolean;
}

/**
 * Copilot data persisted on a GlassSession. Kept separate from the session's
 * own `insights` array so the existing accept/dismiss UI is untouched.
 */
export interface GlassCopilotSessionData {
  insights: GlassCopilotInsight[];
  interventions: GlassCopilotIntervention[];
  debrief?: GlassCopilotDebrief | null;
}

/** Offer shown when the user starts system audio in a live session. */
export interface GlassCopilotOffer {
  reason: "system_audio";
  createdAt: string;
}

/** Runtime copilot state broadcast to renderers (derived, not persisted). */
export interface GlassCopilotRuntimeState {
  mode: GlassCopilotMode;
  config: GlassCopilotConfig;
  /** True only while a session is live and mode !== "off". */
  active: boolean;
  muted: boolean;
  pendingInterventions: GlassCopilotIntervention[];
  insightCount: number;
  lastRunAt?: string;
  lastInterventionAt?: string;
  debrief?: GlassCopilotDebrief | null;
  offer?: GlassCopilotOffer | null;
  /** Set when system audio has been silent past the configured timeout. */
  systemAudioSilenceWarning: boolean;
  /** The session type currently steering insights/cards/debrief. */
  sessionType: GlassCopilotSessionType;
  /** True once a debrief has been generated (panel shows "Debrief Ready"). */
  debriefReady: boolean;
  /** How many cards the user dismissed in a row (governor back-off). */
  consecutiveDismissals: number;
  /** True when max listening duration was reached and the overlay card is showing. */
  listeningLimitReached: boolean;
}

export const COPILOT_INTERVAL_OPTIONS = [60, 90, 120] as const;

export const COPILOT_MODE_LABELS: Record<GlassCopilotMode, string> = {
  off: "Off",
  passive: "Passive",
  coaching: "Coaching",
  diagnostic: "Diagnostic",
};

export const COPILOT_MODE_HINTS: Record<GlassCopilotMode, string> = {
  off: "No auto extraction.",
  passive: "Collect context and save insights silently.",
  coaching: "Show occasional overlay cards when useful.",
  diagnostic: "Watch for stuck/error patterns and offer help.",
};

export const COPILOT_INSIGHT_TYPE_LABELS: Record<GlassCopilotInsightType, string> = {
  key_idea: "Key idea",
  action: "Action",
  question: "Question",
  risk: "Risk",
  opportunity: "Opportunity",
  hypothesis: "Hypothesis",
  memory_candidate: "Memory",
  cursor_prompt_candidate: "Cursor prompt",
  summary_note: "Summary note",
};

export const DEFAULT_COPILOT_CONFIG: GlassCopilotConfig = {
  mode: "off",
  intervalSec: 90,
  showOverlaySuggestions: true,
  autoDebriefOnEnd: true,
  silenceTimeoutMin: 5,
  maxListeningMin: 120,
  muteSuggestions: false,
  sessionType: "auto",
  reportStyle: "concise",
};

export function copilotModeIsActive(mode: GlassCopilotMode): boolean {
  return mode !== "off";
}
