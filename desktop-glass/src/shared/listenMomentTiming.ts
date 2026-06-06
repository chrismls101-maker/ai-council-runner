/**
 * Listen mode — when to surface, wait, save silently, or stay quiet.
 *
 * IIVO should not interrupt because a timer fired. Pure — no electron / fs.
 */

import { isDuplicateText } from "./sessionIntelligence.ts";
import type { ListenMoment, ListenSurfaceContext, SurfaceDecision } from "./listenMomentTypes.ts";

export const LISTEN_MIN_TRANSCRIPT_CHARS = 80;
export const LISTEN_MIN_CONFIDENCE = 0.68;
export const LISTEN_CHUNK_SETTLE_MS = 8_000;

/** Cooldown between proactive surfaces by attention level. */
export const LISTEN_SURFACE_COOLDOWN_MS: Record<ListenSurfaceContext["attentionLevel"], number> = {
  quiet: Infinity,
  balanced: 200_000,
  active: 90_000,
};

/** Max proactive surfaces per 10 minutes by attention level. */
export const LISTEN_MAX_SURFACES_PER_10_MIN: Record<ListenSurfaceContext["attentionLevel"], number> = {
  quiet: 0,
  balanced: 3,
  active: 6,
};

export interface SurfaceDecisionResult {
  decision: SurfaceDecision;
  reason: string;
}

export function shouldSurfaceListenMoment(
  moment: ListenMoment,
  context: ListenSurfaceContext,
): SurfaceDecisionResult {
  const { attentionLevel, nowMs, muteSuggestions } = context;

  if (muteSuggestions) {
    return { decision: "save_silently", reason: "Suggestions muted — saving silently." };
  }

  if (moment.status === "stale") {
    return { decision: "mark_stale", reason: "Topic moved on." };
  }

  if (moment.status === "dismissed" || moment.status === "surfaced" || moment.status === "saved_silently") {
    return { decision: "do_nothing", reason: `Moment already ${moment.status}.` };
  }

  if (context.userReceivingAnswer) {
    return { decision: "save_silently", reason: "User is receiving an answer." };
  }

  if (context.recentTranscriptChars < LISTEN_MIN_TRANSCRIPT_CHARS) {
    return { decision: "wait_for_more_context", reason: "Transcript too thin." };
  }

  if (moment.status === "pending" || moment.status === "developing") {
    if (lastChunkTooRecent(context)) {
      return { decision: "wait_for_more_context", reason: "Idea still developing — waiting for more transcript." };
    }
    if (moment.status === "developing" && moment.confidence < LISTEN_MIN_CONFIDENCE) {
      return { decision: "wait_for_more_context", reason: "Confidence still building." };
    }
  }

  if (moment.confidence < LISTEN_MIN_CONFIDENCE) {
    return { decision: "wait_for_more_context", reason: "Confidence below threshold." };
  }

  if (moment.importance === "low" && attentionLevel !== "active") {
    return { decision: "save_silently", reason: "Low importance — saving for report." };
  }

  if (attentionLevel === "quiet") {
    return { decision: "save_silently", reason: "Quiet mode — no proactive comments." };
  }

  if (lastChunkTooRecent(context) && moment.status !== "ready") {
    return { decision: "wait_for_more_context", reason: "Recent chunk — letting speaker finish." };
  }

  const cooldown = LISTEN_SURFACE_COOLDOWN_MS[attentionLevel];
  if (context.lastSurfaceMs != null && nowMs - context.lastSurfaceMs < cooldown) {
    return { decision: "save_silently", reason: "Cooldown active — saving silently." };
  }

  const maxSurfaces = LISTEN_MAX_SURFACES_PER_10_MIN[attentionLevel];
  if (context.surfacesInLast10Min >= maxSurfaces) {
    return { decision: "save_silently", reason: "Surface cap for attention level reached." };
  }

  const thought = moment.suggestedThought ?? moment.summary;
  if (context.recentSurfacedTexts.some((t) => isDuplicateText(t, thought))) {
    return { decision: "do_nothing", reason: "Similar thought surfaced recently." };
  }

  if (moment.status === "ready" && moment.importance !== "low") {
    return { decision: "surface_now", reason: "Ready high-value moment with enough context." };
  }

  if (attentionLevel === "active" && moment.status === "developing" && moment.importance === "high") {
    return { decision: "surface_now", reason: "Active mode — surfacing developing high-importance moment." };
  }

  if (moment.status === "ready") {
    return { decision: "save_silently", reason: "Ready but not urgent enough to interrupt." };
  }

  return { decision: "wait_for_more_context", reason: "Waiting for stronger context." };
}

function lastChunkTooRecent(context: ListenSurfaceContext): boolean {
  if (context.lastChunkMs == null) return false;
  return context.nowMs - context.lastChunkMs < LISTEN_CHUNK_SETTLE_MS;
}

/** Count surfaces in the rolling 10-minute window. */
export function countSurfacesInLast10Min(timestamps: number[], nowMs: number): number {
  const cutoff = nowMs - 10 * 60_000;
  return timestamps.filter((t) => t >= cutoff).length;
}
