/**
 * IIVO Glass direct ask — shared types (no Electron).
 */

export interface GlassAskSessionEvent {
  kind: string;
  title: string;
  text?: string;
  timestamp?: string;
  sourceTitle?: string;
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
  /** Active Listening rolling context (text/metadata only — no raw audio/base64). */
  activeListening?: import("./activeListeningTypes.ts").ActiveListeningContextPayload;
}

export interface GlassAskLatestScreenshot {
  eventId?: string;
  sessionId?: string;
  contextId?: string;
  screenshotPath?: string;
  thumbnailPath?: string;
  mimeType?: string;
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

export interface GlassAskRequest {
  prompt: string;
  session?: GlassAskSessionPayload;
  latestScreenshot?: GlassAskLatestScreenshot;
  lensContext?: import("./glassLensContext.ts").GlassLensContext;
  visualIntent?: boolean;
  /** overlay = cap length for HUD; full = no cap (structured JSON, long answers). */
  responseStyle?: "overlay" | "full";
  modelPurpose?: "default" | "semantic" | "diagnostic";
  /** Derived passive context summary (local Glass context engine). */
  userContext?: string;
}

export interface GlassAskResponse {
  answer: string;
  shortAnswer?: string;
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
}

export interface GlassLastAskResponse {
  prompt: string;
  answer: string;
  fullAnswer?: string;
  shortAnswer?: string;
  runId?: string;
  contextId?: string;
  at: string;
  routeUsed?: "glass_direct" | "glass_visual_direct";
  model?: string;
}

export type GlassAskStatus = "idle" | "pending" | "done" | "error";

/** Strip markdown headers for overlay display. */
export function formatOverlayAnswerText(raw: string): string {
  return raw
    .trim()
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*Final Action Plan\*\*/gi, "")
    .replace(/\*\*(Decision Quality|Risk Flags|Recommended Action)\*\*/gi, "")
    .replace(/\n{3,}/g, "\n\n");
}

const COUNCIL_MARKERS =
  /\b(Final Action Plan|Decision Quality|Risk Flags|Recommended Action|Sales Attack|Product Decision|Final Judge|Strategist complete)\b/i;

export function isCouncilFormattedAnswer(text: string): boolean {
  return COUNCIL_MARKERS.test(text);
}
