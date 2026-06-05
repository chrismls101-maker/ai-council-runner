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
}

export interface GlassAskRequestBody {
  prompt: string;
  session?: GlassAskSessionPayload;
  latestScreenshot?: GlassAskLatestScreenshot;
  visualIntent?: boolean;
  responseStyle?: "overlay";
  /** Selects env model slot: default text, semantic refine, or diagnostic. */
  modelPurpose?: "default" | "semantic" | "diagnostic";
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
}
