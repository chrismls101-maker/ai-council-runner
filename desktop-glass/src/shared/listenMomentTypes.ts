/**
 * Listen mode — moment intelligence types.
 *
 * Pure data for detecting, ranking, and surfacing useful thoughts while IIVO
 * listens to computer audio. No electron / fs.
 */

export type ListenAttentionLevel = "quiet" | "balanced" | "active";

export const LISTEN_ATTENTION_LABELS: Record<ListenAttentionLevel, string> = {
  quiet: "Quiet",
  balanced: "Balanced",
  active: "Active",
};

export const DEFAULT_LISTEN_ATTENTION_LEVEL: ListenAttentionLevel = "balanced";

export type ListenMomentType =
  | "key_idea"
  | "framework"
  | "tactic"
  | "warning"
  | "example"
  | "claim"
  | "number_stat"
  | "entity_mention"
  | "business_opportunity"
  | "sales_tactic"
  | "implementation_idea"
  | "confusing_concept"
  | "quote"
  | "action_step"
  | "prompt_idea";

export type ListenMomentStatus =
  | "pending"
  | "developing"
  | "ready"
  | "stale"
  | "saved_silently"
  | "surfaced"
  | "dismissed";

export type ListenMomentImportance = "low" | "medium" | "high";

export type ListenMomentDisposition = "surfaced" | "saved_silently" | "deferred";

export interface ListenMoment {
  id: string;
  type: ListenMomentType;
  summary: string;
  transcriptAnchors: string[];
  firstSeenAt: string;
  lastUpdatedAt: string;
  confidence: number;
  importance: ListenMomentImportance;
  suggestedThought?: string;
  suggestedQuestion?: string;
  suggestedAction?: string;
  status: ListenMomentStatus;
  reasonSelected?: string;
  surfacedAt?: string;
  disposition?: ListenMomentDisposition;
  /** Maturity scoring — updated each evaluation pass. */
  maturityScore?: number;
  contextSpanSeconds?: number;
  anchorCount?: number;
  topicStability?: number;
  isStillDeveloping?: boolean;
  isActionableNow?: boolean;
  segmentKind?: import("./listenSegmentClassifier.ts").ListenSegmentKind;
  topicShifted?: boolean;
  staleBecause?: string;
  updatedSuggestedThought?: string;
}

export const DEFAULT_LISTEN_WARMUP_MS = 120_000;

export type SurfaceDecision =
  | "surface_now"
  | "wait_for_more_context"
  | "save_silently"
  | "mark_stale"
  | "do_nothing";

export interface ListenSurfaceContext {
  attentionLevel: ListenAttentionLevel;
  nowMs: number;
  lastSurfaceMs?: number;
  lastChunkMs?: number;
  recentTranscriptChars: number;
  recentSurfacedTexts: string[];
  userReceivingAnswer: boolean;
  muteSuggestions: boolean;
  surfacesInLast10Min: number;
  /** When Listen mode started (ms since epoch). */
  listenStartedMs?: number;
  /** Observe-only warm-up duration before proactive cards. */
  listenWarmupMs?: number;
  /** Current segment classification suppresses proactive cards when true. */
  segmentSuppressProactive?: boolean;
  segmentKind?: import("./listenSegmentClassifier.ts").ListenSegmentKind;
}

export interface ListenMomentEngineState {
  moments: ListenMoment[];
  lastEvalMs?: number;
  lastSurfaceMs?: number;
  recentSurfacedTexts: string[];
  surfaceTimestamps: number[];
  silenceReasons: string[];
  listenStartedMs?: number;
  lastSegmentKind?: import("./listenSegmentClassifier.ts").ListenSegmentKind;
  segmentCounts?: Partial<Record<import("./listenSegmentClassifier.ts").ListenSegmentKind, number>>;
  activeCardId?: string;
  activeMomentId?: string;
  queuedMomentIds: string[];
}

export function initialListenMomentEngineState(): ListenMomentEngineState {
  return {
    moments: [],
    recentSurfacedTexts: [],
    surfaceTimestamps: [],
    silenceReasons: [],
    queuedMomentIds: [],
  };
}

export function clearListenMomentEngineState(): ListenMomentEngineState {
  return initialListenMomentEngineState();
}
