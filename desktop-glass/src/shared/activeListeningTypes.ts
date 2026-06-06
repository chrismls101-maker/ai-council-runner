/**
 * IIVO Glass — Active Listening types.
 *
 * Active Listening is the capability: IIVO stays present while the user
 * watches, listens, sells, learns, or works — and answers questions about
 * what is happening *right now* using recent transcript/session context.
 *
 * Listen and Meetings are the simple modes that expose it. Pure types only.
 */

import type { GlassCopilotMode } from "./copilotTypes.ts";
import type { GlassModeId } from "./glassModePresets.ts";
import type { MediaContext } from "./mediaContextTypes.ts";

export type ActiveListeningChunkSource = "system_audio" | "microphone" | "screen" | "session";

export type ActiveListeningIntent =
  | "ask_thoughts"
  | "explain_current_moment"
  | "agree_disagree"
  | "apply_current_moment"
  | "summarize_recent"
  | "create_asset"
  | "create_script"
  | "sales_coaching"
  | "save_moment"
  | "objection_handling"
  | "prompt_generation"
  | "action_steps"
  | "turn_into_action"
  | "what_did_i_miss"
  | "debrief_request"
  | "general_contextual";

/** Runtime simple mode or Voice when a session is live. */
export type ActiveListeningMode = GlassModeId | "voice" | "off";

export interface ActiveListeningChunk {
  text: string;
  source: ActiveListeningChunkSource;
  timestamp: string;
  confidence?: number;
  tags?: string[];
}

export interface ActiveListeningScreenshotMeta {
  capturedAt?: string;
  sourceTitle?: string;
  label?: string;
  /** File path only — never base64 in session JSON. */
  screenshotPath?: string;
}

/** Serializable payload attached to Glass ask session context. */
export interface ActiveListeningContextPayload {
  enabled: boolean;
  activeMode: ActiveListeningMode;
  /** Window size used (minutes). */
  windowMinutes: number;
  chunkCount: number;
  systemAudioChunkCount: number;
  microphoneChunkCount: number;
  /** Concatenated recent transcript from the window (text only, no raw audio). */
  recentTranscriptWindow: string;
  /** Individual chunks with source metadata. */
  chunks: ActiveListeningChunk[];
  sessionFocus?: string;
  copilotMode?: GlassCopilotMode;
  recentInsights?: string[];
  recentQuestions?: string[];
  lastAnswer?: string;
  screenshotMeta?: ActiveListeningScreenshotMeta;
  /** Classified intent for the current user question. */
  detectedIntent?: ActiveListeningIntent;
  /** True when contextual questions lack enough recent transcript. */
  contextThin?: boolean;
  /** Sales-call coaching signals (Meetings mode). */
  salesSignals?: SalesActiveSignals;
  /** Visible screen/media page context (title, channel, URL — no faces). */
  mediaContext?: MediaContext;
  /** Listen mode — current moment for user-initiated interruptions. */
  currentMoment?: import("./currentMomentContext.ts").CurrentMomentContextPayload;
}

/** Sales / customer-call signals extracted from recent transcript (never invented). */
export interface SalesActiveSignals {
  customerPain: string[];
  objections: string[];
  buyingSignals: string[];
  hesitations: string[];
  competitors: string[];
  budgetTimingConcerns: string[];
  decisionMakers: string[];
  nextSteps: string[];
  dealRisks: string[];
  /** Suggested coaching outputs (short, live-call usable). */
  suggestedMoves: SalesCoachingMove[];
}

export type SalesCoachingMoveKind =
  | "ask_next"
  | "say_this"
  | "clarify"
  | "dont_push"
  | "confirm_pain"
  | "tie_roi"
  | "offer_next_step"
  | "summarize_loop";

export interface SalesCoachingMove {
  kind: SalesCoachingMoveKind;
  text: string;
}

export type ActiveListeningProactiveKind =
  | "customer_objection"
  | "action_item"
  | "important_idea"
  | "useful_framework"
  | "tool_mentioned"
  | "decision_made"
  | "repeated_confusion"
  | "user_excited";

export interface ActiveListeningProactiveMoment {
  kind: ActiveListeningProactiveKind;
  title: string;
  excerpt: string;
  importance: "high" | "medium";
}

/** Default rolling context window (minutes). Configurable internally. */
export const ACTIVE_LISTENING_DEFAULT_WINDOW_MIN = 3;
export const ACTIVE_LISTENING_MAX_WINDOW_MIN = 5;
export const ACTIVE_LISTENING_MIN_TRANSCRIPT_CHARS = 40;

/** Cooldown between proactive Active Listening cards (ms). */
export const ACTIVE_LISTENING_PROACTIVE_COOLDOWN_MS = 90_000;
