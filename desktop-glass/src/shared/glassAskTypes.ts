/**
 * IIVO Glass direct ask — shared types (no Electron).
 */

export type GlassAskMode = "quick" | "council";

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
}

export interface GlassAskRequest {
  prompt: string;
  session?: GlassAskSessionPayload;
  mode?: GlassAskMode;
  responseStyle?: "overlay";
}

export interface GlassAskResponse {
  answer: string;
  modeUsed: GlassAskMode;
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
  runId?: string;
  contextId?: string;
  at: string;
  modeUsed?: GlassAskMode;
}

export type GlassAskStatus = "idle" | "pending" | "done" | "error";

/** Strip markdown headers for overlay display. */
export function formatOverlayAnswerText(raw: string): string {
  return raw
    .trim()
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*Final Action Plan\*\*/gi, "Summary")
    .replace(/\n{3,}/g, "\n\n");
}

export function shouldUseCouncilMode(prompt: string, explicit?: GlassAskMode): GlassAskMode {
  if (explicit === "council" || explicit === "quick") return explicit;
  if (/\b(analyze|analysis|council|strategic decision|deep analysis|strategy for|decision between|tradeoff)\b/i.test(prompt)) {
    return "council";
  }
  return "quick";
}
