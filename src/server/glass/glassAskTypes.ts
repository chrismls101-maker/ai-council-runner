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
  /** Inline capture bytes for one-shot ask when context upload is unavailable (not persisted). */
  imageDataUrl?: string;
  capturedAt?: string;
  sourceTitle?: string;
  displayId?: number;
  label?: string;
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

export interface GlassAskRequestBody {
  prompt: string;
  session?: GlassAskSessionPayload;
  latestScreenshot?: GlassAskLatestScreenshot;
  responseStyle?: "overlay";
}

export interface GlassAskResponseBody {
  answer: string;
  shortAnswer?: string;
  model?: string;
  routeUsed: "glass_direct" | "glass_visual_direct";
  runId?: string;
  contextId?: string;
  title?: string;
  warnings?: string[];
  usage?: unknown;
}
