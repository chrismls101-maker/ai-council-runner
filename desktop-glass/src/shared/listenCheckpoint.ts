/**
 * Listen Mode checkpoint summaries — long-session memory without full transcript replay.
 */

import type { ListenMoment } from "./listenMomentTypes.ts";
import type { ListenSegmentKind } from "./listenSegmentClassifier.ts";

export const DEFAULT_LISTEN_CHECKPOINT_MINUTES = 30;

/** Streaming Listen mode — topic checkpoints every 2–5 min (default 3). */
export const STREAMING_LISTEN_CHECKPOINT_MINUTES = 5;

const IGNORED_SEGMENT_KINDS: ListenSegmentKind[] = ["ad", "sponsor", "intro"];

function isMainContentListenMoment(moment: ListenMoment): boolean {
  const kind = moment.segmentKind;
  if (!kind) return true;
  return !IGNORED_SEGMENT_KINDS.includes(kind);
}

export interface ListenCheckpointSummary {
  checkpointIndex: number;
  windowStartMs: number;
  windowEndMs: number;
  writtenAt: string;
  topicSummary: string;
  bestIdeas: string[];
  topMoments: string[];
  openQuestions: string[];
  quotes: string[];
  transcriptAnchors: string[];
  actionIdeas: string[];
  confidence: number;
  ignoredAds: string[];
  silentlySavedCount: number;
  surfacedCount: number;
  /** Minutes from session start (for display). */
  elapsedStartMin: number;
  elapsedEndMin: number;
}

export function checkpointIntervalMs(checkpointMinutes = DEFAULT_LISTEN_CHECKPOINT_MINUTES): number {
  return Math.max(2, Math.min(120, checkpointMinutes)) * 60_000;
}

export function shouldWriteListenCheckpoint(opts: {
  listenStartedMs: number;
  nowMs: number;
  lastCheckpointIndex: number;
  checkpointMinutes?: number;
}): { write: boolean; checkpointIndex: number } {
  const intervalMs = checkpointIntervalMs(opts.checkpointMinutes);
  const elapsed = opts.nowMs - opts.listenStartedMs;
  if (elapsed < intervalMs) return { write: false, checkpointIndex: 0 };
  const checkpointIndex = Math.floor(elapsed / intervalMs);
  if (checkpointIndex <= opts.lastCheckpointIndex) {
    return { write: false, checkpointIndex: opts.lastCheckpointIndex };
  }
  return { write: true, checkpointIndex };
}

function momentInWindow(moment: ListenMoment, startMs: number, endMs: number): boolean {
  const t = Date.parse(moment.lastUpdatedAt);
  if (Number.isNaN(t)) return true;
  return t >= startMs && t <= endMs;
}

function topLines(moments: ListenMoment[], max: number): string[] {
  return moments
    .filter(isMainContentListenMoment)
    .slice(0, max)
    .map((m) => {
      const anchor = m.transcriptAnchors[0] ? ` — "${m.transcriptAnchors[0].slice(0, 80)}"` : "";
      return `${m.suggestedThought ?? m.summary}${anchor}`;
    });
}

function ignoredInWindow(moments: ListenMoment[], startMs: number, endMs: number): string[] {
  const ignoredKinds: ListenSegmentKind[] = ["ad", "sponsor", "intro"];
  return moments
    .filter((m) => momentInWindow(m, startMs, endMs))
    .filter((m) => m.segmentKind && ignoredKinds.includes(m.segmentKind))
    .slice(0, 6)
    .map((m) => `[${m.segmentKind}] ${m.transcriptAnchors[0]?.slice(0, 80) ?? m.summary.slice(0, 80)}`);
}

export function buildListenCheckpointSummary(opts: {
  checkpointIndex: number;
  listenStartedMs: number;
  nowMs: number;
  moments: ListenMoment[];
  checkpointMinutes?: number;
}): ListenCheckpointSummary {
  const intervalMs = checkpointIntervalMs(opts.checkpointMinutes);
  const windowEndMs = opts.listenStartedMs + opts.checkpointIndex * intervalMs;
  const windowStartMs = windowEndMs - intervalMs;

  const inWindow = opts.moments.filter((m) => momentInWindow(m, windowStartMs, windowEndMs));
  const content = inWindow.filter(isMainContentListenMoment);

  const bestIdeas = topLines(
    content.filter((m) => ["ready", "surfaced", "saved_silently"].includes(m.status)),
    5,
  );
  const topMoments = topLines(content.filter((m) => m.status === "surfaced" || m.status === "saved_silently"), 4);
  const openQuestions = content
    .filter((m) => m.suggestedQuestion)
    .map((m) => m.suggestedQuestion!)
    .slice(0, 4);
  const quotes = content
    .filter((m) => m.type === "quote" || m.transcriptAnchors.length > 0)
    .map((m) => m.transcriptAnchors[0]?.slice(0, 120) ?? m.summary)
    .filter(Boolean)
    .slice(0, 4);

  const transcriptAnchors = content
    .flatMap((m) => m.transcriptAnchors)
    .filter(Boolean)
    .slice(0, 6);

  const actionIdeas = content
    .filter((m) => m.type === "action_step" || m.type === "prompt_idea" || m.suggestedAction)
    .map((m) => m.suggestedAction ?? m.suggestedThought ?? m.summary)
    .slice(0, 4);

  const avgConfidence =
    content.length > 0
      ? content.reduce((sum, m) => sum + m.confidence, 0) / content.length
      : 0;

  const topicSummary =
    bestIdeas[0] ??
    topMoments[0] ??
    (transcriptAnchors[0] ? `Discussing: ${transcriptAnchors[0].slice(0, 120)}` : "Topic still forming.");

  return {
    checkpointIndex: opts.checkpointIndex,
    windowStartMs,
    windowEndMs,
    writtenAt: new Date(opts.nowMs).toISOString(),
    topicSummary,
    bestIdeas,
    topMoments,
    openQuestions,
    quotes,
    transcriptAnchors,
    actionIdeas,
    confidence: Math.round(avgConfidence * 100) / 100,
    ignoredAds: ignoredInWindow(opts.moments, windowStartMs, windowEndMs),
    silentlySavedCount: inWindow.filter((m) => m.status === "saved_silently").length,
    surfacedCount: inWindow.filter((m) => m.status === "surfaced").length,
    elapsedStartMin: Math.round((windowStartMs - opts.listenStartedMs) / 60_000),
    elapsedEndMin: Math.round((windowEndMs - opts.listenStartedMs) / 60_000),
  };
}

export function checkpointSummaryToMarkdown(checkpoint: ListenCheckpointSummary): string {
  const lines = [
    `### Checkpoint ${checkpoint.checkpointIndex} (${checkpoint.elapsedStartMin}–${checkpoint.elapsedEndMin} min)`,
    "",
    `**Topic:** ${checkpoint.topicSummary}`,
    `Confidence: ${checkpoint.confidence} · surfaced ${checkpoint.surfacedCount} · saved silently ${checkpoint.silentlySavedCount}`,
    "",
  ];
  if (checkpoint.bestIdeas.length) {
    lines.push("**Best ideas**", ...checkpoint.bestIdeas.map((i) => `- ${i}`), "");
  }
  if (checkpoint.openQuestions.length) {
    lines.push("**Questions to revisit**", ...checkpoint.openQuestions.map((i) => `- ${i}`), "");
  }
  if (checkpoint.actionIdeas.length) {
    lines.push("**Action ideas (notes)**", ...checkpoint.actionIdeas.map((i) => `- ${i}`), "");
  }
  if (checkpoint.ignoredAds.length) {
    lines.push("**Ignored ads/sponsors**", ...checkpoint.ignoredAds.map((i) => `- ${i}`), "");
  }
  return lines.join("\n").trim();
}

export function listenCheckpointsFromSessionEvents(
  events: Array<{ tags?: string[]; metadata?: unknown; timestamp?: string }>,
): ListenCheckpointSummary[] {
  const out: ListenCheckpointSummary[] = [];
  for (const e of events) {
    if (!e.tags?.includes("listen_checkpoint")) continue;
    const meta = e.metadata as { listenCheckpoint?: ListenCheckpointSummary } | undefined;
    if (meta?.listenCheckpoint) out.push(meta.listenCheckpoint);
  }
  return out.sort((a, b) => a.checkpointIndex - b.checkpointIndex);
}
