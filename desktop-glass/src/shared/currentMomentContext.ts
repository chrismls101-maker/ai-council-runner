/**
 * Listen Mode — "Ask About This Moment" context builder.
 *
 * Gathers recent system-audio transcript, listen moments, media context, and
 * pause/stale state so user interruptions answer from what was just said.
 *
 * Pure — no electron / fs.
 */

import {
  buildActiveListeningContext,
  type BuildActiveListeningInput,
} from "./activeListeningContext.ts";
import {
  ACTIVE_LISTENING_MIN_TRANSCRIPT_CHARS,
  type ActiveListeningContextPayload,
  type ActiveListeningChunk,
} from "./activeListeningTypes.ts";
import {
  classifyActiveListeningIntent,
  intentNeedsRecentTranscript,
} from "./activeListeningIntent.ts";
import type { ListenMoment } from "./listenMomentTypes.ts";

export const CURRENT_MOMENT_WINDOW_MS = 120_000;
export const CURRENT_MOMENT_MIN_WINDOW_MS = 30_000;
/** No new chunks for this long → treat as paused (video likely stopped). */
export const TRANSCRIPT_PAUSE_MS = 30_000;
/** Preserve last moment this long after pause before marking stale. */
export const TRANSCRIPT_STALE_MS = 5 * 60_000;

export type MomentContextStatus = "ready" | "thin" | "paused" | "stale";

export interface CurrentMomentSnapshot {
  id: string;
  type: string;
  summary: string;
  anchors: string[];
  suggestedThought?: string;
  status: string;
}

export interface CurrentMomentContextPayload {
  /** Last ~30–120s of main-content system_audio transcript. */
  recentMomentTranscript: string;
  activeMoment?: CurrentMomentSnapshot;
  recentMatureMoment?: CurrentMomentSnapshot;
  savedMomentsSilently: CurrentMomentSnapshot[];
  latestSurfacedThought?: string;
  userQuestion?: string;
  momentContextStatus: MomentContextStatus;
  momentStatusMessage?: string;
  lastTranscriptAtMs?: number;
  pausedForMs?: number;
}

export interface BuildCurrentMomentInput extends BuildActiveListeningInput {
  listenMoments?: ListenMoment[];
  activeMomentId?: string;
  lastSystemAudioChunkMs?: number;
  /** When true, mic may be included for Meetings — never for Listen mode context. */
  voiceModeActive?: boolean;
}

function parseIsoMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

function momentSnapshot(moment: ListenMoment): CurrentMomentSnapshot {
  return {
    id: moment.id,
    type: moment.type,
    summary: moment.summary,
    anchors: moment.transcriptAnchors.slice(0, 5),
    suggestedThought: moment.suggestedThought,
    status: moment.status,
  };
}

function pickRecentMatureMoment(moments: ListenMoment[]): ListenMoment | undefined {
  const pool = moments.filter(
    (m) =>
      (m.status === "ready" || m.status === "surfaced" || m.status === "saved_silently") &&
      m.isStillDeveloping !== true &&
      m.transcriptAnchors.length > 0,
  );
  if (!pool.length) return undefined;
  return [...pool].sort((a, b) => {
    const imp = { high: 3, medium: 2, low: 1 };
    return imp[b.importance] - imp[a.importance] || b.confidence - a.confidence;
  })[0];
}

function filterChunksForCurrentMoment(
  chunks: ActiveListeningChunk[],
  nowMs: number,
): ActiveListeningChunk[] {
  const cutoff = nowMs - CURRENT_MOMENT_WINDOW_MS;
  return chunks.filter((c) => {
    const t = parseIsoMs(c.timestamp);
    if (t > 0 && t < cutoff) return false;
    return c.source === "system_audio" || c.source === "session";
  });
}

export function resolveMomentContextStatus(opts: {
  recentMomentTranscript: string;
  lastSystemAudioChunkMs?: number;
  nowMs?: number;
}): {
  status: MomentContextStatus;
  message?: string;
  pausedForMs?: number;
  lastTranscriptAtMs?: number;
} {
  const nowMs = opts.nowMs ?? Date.now();
  const chars = opts.recentMomentTranscript.trim().length;
  const lastMs = opts.lastSystemAudioChunkMs;
  const pausedForMs = lastMs != null ? nowMs - lastMs : undefined;

  if (chars < ACTIVE_LISTENING_MIN_TRANSCRIPT_CHARS) {
    return {
      status: "thin",
      message:
        "I'm still building context from the video. I need a little more transcript, or ask about a specific line.",
      lastTranscriptAtMs: lastMs,
      pausedForMs,
    };
  }

  if (pausedForMs != null && pausedForMs > TRANSCRIPT_STALE_MS) {
    return {
      status: "stale",
      message:
        "I can answer based on the last captured part, but the video may have moved on.",
      lastTranscriptAtMs: lastMs,
      pausedForMs,
    };
  }

  if (pausedForMs != null && pausedForMs > TRANSCRIPT_PAUSE_MS) {
    return {
      status: "paused",
      message: "Answering from the last captured moment…",
      lastTranscriptAtMs: lastMs,
      pausedForMs,
    };
  }

  return {
    status: "ready",
    message: "Using recent video context…",
    lastTranscriptAtMs: lastMs,
    pausedForMs,
  };
}

/** Status line for overlay while answering a Listen-mode interruption. */
export function listenInterruptStatusLabel(
  ctx: ActiveListeningContextPayload | undefined,
): string | undefined {
  if (!ctx?.enabled || ctx.activeMode !== "listen") return undefined;
  const cm = ctx.currentMoment;
  if (!cm) return undefined;
  if (cm.momentContextStatus === "thin") return undefined;
  return cm.momentStatusMessage;
}

/**
 * Build Active Listening context enriched with current-moment data for Listen mode.
 * Other modes delegate to {@link buildActiveListeningContext} unchanged.
 */
export function buildCurrentMomentContext(
  input: BuildCurrentMomentInput,
): ActiveListeningContextPayload | undefined {
  const base = buildActiveListeningContext(input);
  if (!base?.enabled || base.activeMode !== "listen") return base;

  const nowMs = input.nowMs ?? Date.now();
  const moments = input.listenMoments ?? [];
  const momentChunks = filterChunksForCurrentMoment(base.chunks, nowMs);
  let recentMomentTranscript = momentChunks.map((c) => c.text).join(" ").trim();

  if (
    recentMomentTranscript.length < ACTIVE_LISTENING_MIN_TRANSCRIPT_CHARS &&
    base.recentTranscriptWindow.trim()
  ) {
    recentMomentTranscript = base.recentTranscriptWindow.trim().slice(-1200);
  }

  const activeMoment = input.activeMomentId
    ? moments.find((m) => m.id === input.activeMomentId)
    : undefined;
  const mature = pickRecentMatureMoment(moments);
  const savedSilently = moments
    .filter((m) => m.status === "saved_silently")
    .slice(-5)
    .map(momentSnapshot);
  const surfaced = moments.find((m) => m.status === "surfaced");
  const latestSurfacedThought = surfaced?.suggestedThought ?? activeMoment?.suggestedThought;

  const { status, message, pausedForMs, lastTranscriptAtMs } = resolveMomentContextStatus({
    recentMomentTranscript,
    lastSystemAudioChunkMs: input.lastSystemAudioChunkMs,
    nowMs,
  });

  const intent = input.userPrompt ? classifyActiveListeningIntent(input.userPrompt) : undefined;
  const needsTranscript = intent != null && intentNeedsRecentTranscript(intent);
  const contextThin =
    needsTranscript && status === "thin";

  const currentMoment: CurrentMomentContextPayload = {
    recentMomentTranscript,
    activeMoment: activeMoment ? momentSnapshot(activeMoment) : undefined,
    recentMatureMoment: mature ? momentSnapshot(mature) : undefined,
    savedMomentsSilently: savedSilently,
    latestSurfacedThought,
    userQuestion: input.userPrompt?.trim(),
    momentContextStatus: status,
    momentStatusMessage: message,
    lastTranscriptAtMs,
    pausedForMs,
  };

  return {
    ...base,
    detectedIntent: intent ?? base.detectedIntent,
    contextThin,
    currentMoment,
  };
}
