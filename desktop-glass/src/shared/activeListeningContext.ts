/**
 * Active Listening — rolling context window builder.
 *
 * Collects recent transcript chunks (system audio + mic), session metadata,
 * insights, and optional screenshot metadata. Never includes raw audio or base64.
 */

import type { GlassSession, GlassSessionEvent } from "./sessionTypes.ts";
import type { GlassCopilotConfig } from "./copilotTypes.ts";
import type { GlassModeId } from "./glassModePresets.ts";
import {
  ACTIVE_LISTENING_DEFAULT_WINDOW_MIN,
  ACTIVE_LISTENING_MAX_WINDOW_MIN,
  ACTIVE_LISTENING_MIN_TRANSCRIPT_CHARS,
  type ActiveListeningChunk,
  type ActiveListeningChunkSource,
  type ActiveListeningContextPayload,
  type ActiveListeningMode,
  type ActiveListeningScreenshotMeta,
} from "./activeListeningTypes.ts";
import {
  classifyActiveListeningIntent,
  intentNeedsRecentTranscript,
} from "./activeListeningIntent.ts";
import { extractSalesActiveSignals, looksLikeSalesCallContext } from "./salesActiveCoaching.ts";
import type { MediaContext } from "./mediaContextTypes.ts";

export interface BuildActiveListeningInput {
  session: GlassSession | null;
  sessionLive: boolean;
  /** Full running transcript fallback when events are sparse. */
  runningTranscript?: string;
  copilotConfig: GlassCopilotConfig;
  activeMode: ActiveListeningMode;
  recentQuestions?: string[];
  lastAnswer?: string;
  screenshotMeta?: ActiveListeningScreenshotMeta;
  mediaContext?: MediaContext | null;
  /** Current user question (for intent classification). */
  userPrompt?: string;
  nowMs?: number;
  windowMinutes?: number;
}

function chunkSourceFromEvent(event: GlassSessionEvent): ActiveListeningChunkSource {
  if (event.tags?.includes("system_audio")) return "system_audio";
  if (event.tags?.includes("microphone")) return "microphone";
  if (event.kind === "screen_capture" || event.kind === "app_context") return "screen";
  return "session";
}

function eventToChunk(event: GlassSessionEvent): ActiveListeningChunk | null {
  const text = (event.text ?? event.title ?? "").trim();
  if (!text || event.kind === "iivo_response" || event.kind === "iivo_command") return null;
  return {
    text,
    source: chunkSourceFromEvent(event),
    timestamp: event.timestamp,
    tags: event.tags,
  };
}

function withinWindow(timestamp: string, cutoffMs: number, nowMs: number): boolean {
  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return true;
  return t >= cutoffMs && t <= nowMs;
}

/** Derive simple active mode from copilot config when not explicitly set. */
export function deriveActiveListeningMode(
  config: GlassCopilotConfig,
  copilotActive: boolean,
): ActiveListeningMode {
  if (!copilotActive || config.mode === "off") return "off";
  if (config.mode === "diagnostic") return "fix";
  if (config.sessionType === "meeting_call") return "meetings";
  if (config.sessionType === "video_learning") return "listen";
  return "work";
}

export function activeListeningEnabledForMode(mode: ActiveListeningMode): boolean {
  return mode !== "off";
}

export function buildActiveListeningContext(input: BuildActiveListeningInput): ActiveListeningContextPayload | undefined {
  const {
    session,
    sessionLive,
    runningTranscript = "",
    copilotConfig,
    activeMode,
    recentQuestions = [],
    lastAnswer,
    screenshotMeta,
    userPrompt,
    nowMs = Date.now(),
  } = input;

  if (!sessionLive || !activeListeningEnabledForMode(activeMode)) return undefined;

  const windowMin = Math.min(
    Math.max(input.windowMinutes ?? ACTIVE_LISTENING_DEFAULT_WINDOW_MIN, 2),
    ACTIVE_LISTENING_MAX_WINDOW_MIN,
  );
  const cutoffMs = nowMs - windowMin * 60_000;

  const events = session?.events ?? [];
  const chunks: ActiveListeningChunk[] = [];
  for (const event of events) {
    if (!withinWindow(event.timestamp, cutoffMs, nowMs)) continue;
    const chunk = eventToChunk(event);
    if (!chunk) continue;
    // Listen mode = computer audio only; exclude microphone unless Voice explicitly on.
    if (activeMode === "listen" && chunk.source === "microphone") continue;
    chunks.push(chunk);
  }

  // Fallback: if no timed chunks, use tail of running transcript (text only).
  if (chunks.length === 0 && runningTranscript.trim()) {
    const tail = runningTranscript.trim().slice(-2000);
    chunks.push({
      text: tail,
      source: "session",
      timestamp: new Date(nowMs).toISOString(),
    });
  }

  const recentTranscriptWindow = chunks.map((c) => c.text).join(" ").trim();
  const systemAudioChunkCount = chunks.filter((c) => c.source === "system_audio").length;
  const microphoneChunkCount = chunks.filter((c) => c.source === "microphone").length;

  const copilotInsights = session?.insights?.slice(-5).map((i) => `${i.type}: ${i.text}`) ?? [];

  const detectedIntent = userPrompt ? classifyActiveListeningIntent(userPrompt) : undefined;
  const contextThin =
    detectedIntent != null &&
    intentNeedsRecentTranscript(detectedIntent) &&
    recentTranscriptWindow.length < ACTIVE_LISTENING_MIN_TRANSCRIPT_CHARS;

  let salesSignals;
  if (
    activeMode === "meetings" &&
    recentTranscriptWindow.length >= ACTIVE_LISTENING_MIN_TRANSCRIPT_CHARS &&
    looksLikeSalesCallContext(recentTranscriptWindow, session?.events.at(-1)?.sourceApp)
  ) {
    salesSignals = extractSalesActiveSignals(recentTranscriptWindow);
  }

  return {
    enabled: true,
    activeMode,
    windowMinutes: windowMin,
    chunkCount: chunks.length,
    systemAudioChunkCount,
    microphoneChunkCount,
    recentTranscriptWindow,
    chunks: chunks.slice(-40),
    sessionFocus: copilotConfig.sessionType,
    copilotMode: copilotConfig.mode,
    recentInsights: copilotInsights.length ? copilotInsights : undefined,
    recentQuestions: recentQuestions.slice(-5),
    lastAnswer: lastAnswer?.slice(0, 500),
    screenshotMeta,
    detectedIntent,
    contextThin,
    salesSignals,
    mediaContext: input.mediaContext ?? undefined,
  };
}

/** User-facing message when contextual question lacks recent transcript. */
export function activeListeningMissingContextMessage(intent?: string): string {
  void intent;
  return "I need more recent transcript to answer that. Keep listening for a moment, then ask again.";
}

/** Resolve active mode from preset id (Listen / Meetings) or derived state. */
export function resolveActiveModeFromPreset(presetId: GlassModeId | null, derived: ActiveListeningMode): ActiveListeningMode {
  if (presetId) return presetId;
  return derived;
}
