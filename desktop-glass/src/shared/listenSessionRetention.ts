/**
 * Session transcript retention — bound memory for long Listen runs.
 */

import type { GlassSessionEvent } from "./sessionTypes.ts";

/** Max transcript_note events kept in session store (older dropped, non-transcript preserved). */
export const MAX_TRANSCRIPT_EVENTS_IN_SESSION = 2000;

/** Max chars in running transcript string on main state. */
export const MAX_RUNNING_TRANSCRIPT_CHARS = 50_000;

/** Max listen_moment events kept when pruning (checkpoints preserved). */
export const MAX_LISTEN_MOMENT_EVENTS = 400;

/** Max checkpoint summaries kept in session store (older dropped). */
export const MAX_LISTEN_CHECKPOINT_EVENTS = 80;

export function pruneRunningTranscript(
  text: string,
  maxChars = MAX_RUNNING_TRANSCRIPT_CHARS,
): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(trimmed.length - maxChars);
}

function isListenCheckpointEvent(event: GlassSessionEvent): boolean {
  return event.tags?.includes("listen_checkpoint") === true;
}

function isListenMomentEvent(event: GlassSessionEvent): boolean {
  return event.tags?.includes("listen_moment") === true;
}

/**
 * Drop oldest transcript_note events beyond cap. Preserves checkpoints and other kinds.
 * listen_moment events trimmed separately to MAX_LISTEN_MOMENT_EVENTS (newest kept).
 */
export function pruneTranscriptSessionEvents(
  events: GlassSessionEvent[],
  opts: {
    maxTranscriptEvents?: number;
    maxListenMomentEvents?: number;
    maxCheckpointEvents?: number;
  } = {},
): GlassSessionEvent[] {
  const maxTranscript = opts.maxTranscriptEvents ?? MAX_TRANSCRIPT_EVENTS_IN_SESSION;
  const maxMoments = opts.maxListenMomentEvents ?? MAX_LISTEN_MOMENT_EVENTS;

  const nonTranscript = events.filter((e) => e.kind !== "transcript_note" && !isListenMomentEvent(e));
  const transcripts = events.filter((e) => e.kind === "transcript_note");
  const moments = events.filter((e) => isListenMomentEvent(e) && !isListenCheckpointEvent(e));
  const checkpoints = events.filter((e) => isListenCheckpointEvent(e));

  const keptTranscripts =
    transcripts.length > maxTranscript ? transcripts.slice(transcripts.length - maxTranscript) : transcripts;
  const keptMoments = moments.length > maxMoments ? moments.slice(moments.length - maxMoments) : moments;
  const maxCheckpoints = opts.maxCheckpointEvents ?? MAX_LISTEN_CHECKPOINT_EVENTS;
  const keptCheckpoints =
    checkpoints.length > maxCheckpoints ? checkpoints.slice(checkpoints.length - maxCheckpoints) : checkpoints;

  const merged = [...nonTranscript, ...keptTranscripts, ...keptMoments, ...keptCheckpoints];
  merged.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return merged;
}

/** Transcript events within a rolling time window (for bounded prompt context). */
export function transcriptEventsInWindow(
  events: GlassSessionEvent[],
  windowMs: number,
  nowMs: number,
): GlassSessionEvent[] {
  const cutoff = nowMs - windowMs;
  return events.filter((e) => {
    if (e.kind !== "transcript_note") return false;
    const t = Date.parse(e.timestamp);
    if (Number.isNaN(t)) return true;
    return t >= cutoff && t <= nowMs;
  });
}

export function combinedTranscriptText(events: GlassSessionEvent[], maxChars = 8000): string {
  const text = events
    .filter((e) => e.kind === "transcript_note")
    .map((e) => (e.text ?? e.title ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (text.length <= maxChars) return text;
  return text.slice(text.length - maxChars);
}
