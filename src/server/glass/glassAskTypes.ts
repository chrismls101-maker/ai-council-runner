/**
 * IIVO Glass direct ask — server request/response types.
 */

export interface GlassAskSessionEvent {
  kind: string;
  title: string;
  text?: string;
  timestamp?: string;
  sourceTitle?: string;
}

export interface GlassAskLatestScreenshot {
  eventId?: string;
  sessionId?: string;
  contextId?: string;
  screenshotPath?: string;
  thumbnailPath?: string;
  mimeType?: string;
  /** Optimized inline capture for vision (JPEG/WebP data URL — not full-resolution PNG). */
  imageDataUrl?: string;
  imageBase64?: string;
  capturedAt?: string;
  sourceTitle?: string;
  displayId?: number;
  label?: string;
  originalWidth?: number;
  originalHeight?: number;
  optimizedWidth?: number;
  optimizedHeight?: number;
  optimizedMimeType?: string;
  optimizedSizeBytes?: number;
  compressionApplied?: boolean;
}

export interface GlassAskSessionPayload {
  sessionId?: string;
  title?: string;
  summary?: string;
  recentEvents?: GlassAskSessionEvent[];
  recentTranscript?: string;
  recentInsights?: string[];
  currentSource?: {
    appName?: string;
    windowTitle?: string;
    sourceTitle?: string;
  };
  activeListening?: import("./activeListeningPrompt.js").ActiveListeningContextPayload;
}

export interface GlassAskRequestBody {
  prompt: string;
  session?: GlassAskSessionPayload;
  latestScreenshot?: GlassAskLatestScreenshot;
  lensContext?: import("./glassLensContext.js").GlassAskLensContext;
  visualIntent?: boolean;
  /** overlay = cap length for HUD; full = no cap (structured JSON, long answers). */
  responseStyle?: "overlay" | "full";
  /** Selects env model slot: default text, semantic refine, or diagnostic. */
  modelPurpose?: "default" | "semantic" | "diagnostic";
  userProfile?: import("../userProfile/types.js").GlassUserProfile;
  /** Passive context summary from Glass context engine (preferred over raw userProfile). */
  userContext?: string;
  /** Glass Companion session — request structured uiMap + guidancePlan on visual asks. */
  companionMode?: boolean;
  /** Local AX/DOM marks from Glass capture (Set-of-Marks context). */
  companionUiMap?: {
    captureId: string;
    width: number;
    height: number;
    marks: Array<{
      id: string;
      label?: string;
      source: string;
      bounds: { x: number; y: number; w: number; h: number };
    }>;
  };
  /** Phase 4a — how Companion should handle this turn. */
  companionRoute?: "full_visual_ask" | "retarget" | "direct_follow_up" | "script_continue" | "barge_in";
  /** Phase 4a — prior guidance context (no inline image blobs). */
  companionMemory?: {
    lastPrompt: string;
    lastUiMap: {
      captureId: string;
      width: number;
      height: number;
      marks: Array<{
        id: string;
        label?: string;
        source: string;
        bounds: { x: number; y: number; w: number; h: number };
      }>;
    };
    lastGuidancePlan: {
      captureId: string;
      speech: Array<{ segmentIndex: number; text: string }>;
      manifestations: Array<{
        type: string;
        targetMarkId: string;
        enterAtSegment: number;
        exitAtSegment?: number;
        label?: string;
      }>;
      panel?: string;
    };
    lastCaptureId: string;
    lastCaptureAt: number;
    activeMarkIds: string[];
    frontApp?: string;
    windowTitle?: string;
  };
  /** When true, omit stored/user profile from the prompt (e.g. session debrief). */
  suppressUserProfile?: boolean;
}

export interface GlassAskResponseBody {
  answer: string;
  shortAnswer?: string;
  /** Model actually used (backward compatible). */
  model?: string;
  modelRequested?: string;
  modelUsed?: string;
  fallbackUsed?: boolean;
  routeUsed: "glass_direct" | "glass_visual_direct";
  usedVision?: boolean;
  runId?: string;
  contextId?: string;
  title?: string;
  warnings?: string[];
  usage?: unknown;
  /** Structured presence payload when companionMode was true on a visual ask. */
  companionGuidance?: import("./glassCompanionGuidance.js").CompanionGuidancePayload;
}
