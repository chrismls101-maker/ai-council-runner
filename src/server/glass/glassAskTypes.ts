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
  responseStyle?: "overlay";
}

export interface GlassAskResponseBody {
  answer: string;
  shortAnswer?: string;
  model?: string;
  routeUsed: "glass_direct";
  runId?: string;
  contextId?: string;
  title?: string;
  warnings?: string[];
  usage?: unknown;
}
