/**
 * IIVO Glass Session Intelligence — shared types.
 *
 * A "session" is an explicit, user-started window of work that Glass observes
 * locally: a timeline of events plus deterministically-extracted insights.
 * Nothing here records or sends on its own.
 */

export type GlassSessionStatus = "idle" | "active" | "paused" | "ended";

export type GlassSessionEventKind =
  | "session_started"
  | "session_paused"
  | "session_resumed"
  | "session_ended"
  | "screen_capture"
  | "transcript_note"
  | "saved_moment"
  | "manual_note"
  | "iivo_sent"
  | "iivo_analysis"
  | "iivo_command"
  | "iivo_response"
  | "insight_detected"
  | "hypothesis_detected"
  | "action_detected"
  | "risk_detected"
  | "app_context"
  | "listening_limit_reached";

export type GlassSessionImportance = "low" | "medium" | "high";

export type GlassSessionEvent = {
  id: string;
  sessionId: string;
  kind: GlassSessionEventKind;
  timestamp: string;
  title: string;
  text?: string;
  sourceApp?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  screenshotPath?: string;
  thumbnailPath?: string;
  screenshotMimeType?: string;
  screenshotSizeBytes?: number;
  screenshotDataUrl?: string;
  tags?: string[];
  importance?: GlassSessionImportance;
  metadata?: Record<string, unknown>;
};

export type GlassInsightType =
  | "key_idea"
  | "hypothesis"
  | "risk"
  | "action"
  | "question"
  | "memory_candidate";

export type GlassSessionInsight = {
  id: string;
  sessionId: string;
  timestamp: string;
  type: GlassInsightType;
  title: string;
  text: string;
  sourceEventIds: string[];
  importance: GlassSessionImportance;
  accepted?: boolean;
};

export type GlassSession = {
  id: string;
  title: string;
  status: GlassSessionStatus;
  startedAt: string;
  endedAt?: string;
  pausedAt?: string;
  updatedAt: string;
  events: GlassSessionEvent[];
  insights: GlassSessionInsight[];
  summary?: string;
  /** Session Copilot data (insights / interventions / debrief). Optional. */
  copilot?: import("./copilotTypes.ts").GlassCopilotSessionData;
};
