/**
 * Listen mode — moment maturity scoring before surfacing thoughts.
 *
 * Pure — no electron / fs.
 */

import type { ListenMoment, ListenMomentStatus } from "./listenMomentTypes.ts";
import type { ListenSegmentKind } from "./listenSegmentClassifier.ts";
import { segmentKindAllowsProactiveCards } from "./listenSegmentClassifier.ts";

export const LISTEN_MIN_CONTEXT_SPAN_SEC = 45;
export const LISTEN_MIN_ANCHOR_COUNT = 3;

export interface MomentMaturityFields {
  maturityScore: number;
  contextSpanSeconds: number;
  anchorCount: number;
  topicStability: number;
  isStillDeveloping: boolean;
  isActionableNow: boolean;
  segmentKind?: ListenSegmentKind;
}

function parseIsoMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/** Compute maturity metrics for a listen moment. */
export function computeMomentMaturity(
  moment: ListenMoment,
  nowMs: number,
  segmentKind: ListenSegmentKind = "content",
): MomentMaturityFields {
  const anchorCount = moment.transcriptAnchors.length;
  const firstMs = parseIsoMs(moment.firstSeenAt);
  const lastMs = parseIsoMs(moment.lastUpdatedAt);
  const contextSpanSeconds = firstMs > 0 ? Math.max(0, Math.round((nowMs - firstMs) / 1000)) : 0;

  const anchorChars = moment.transcriptAnchors.join(" ").length;
  const topicStability = Math.min(
    1,
    anchorCount * 0.22 + Math.min(contextSpanSeconds / 120, 0.35) + Math.min(anchorChars / 400, 0.25),
  );

  const hasCompleteClaim =
    anchorChars >= 80 ||
    (anchorCount >= 2 && moment.transcriptAnchors.some((a) => a.length >= 60));

  const isStillDeveloping =
    moment.status === "pending" ||
    moment.status === "developing" ||
    (contextSpanSeconds < LISTEN_MIN_CONTEXT_SPAN_SEC && anchorCount < LISTEN_MIN_ANCHOR_COUNT) ||
    !hasCompleteClaim;

  const segmentOk = segmentKindAllowsProactiveCards(segmentKind);
  const meetsSpanOrAnchors =
    contextSpanSeconds >= LISTEN_MIN_CONTEXT_SPAN_SEC || anchorCount >= LISTEN_MIN_ANCHOR_COUNT;

  const isActionableNow =
    segmentOk &&
    meetsSpanOrAnchors &&
    !isStillDeveloping &&
    moment.status === "ready" &&
    moment.confidence >= 0.68 &&
    Boolean(moment.suggestedThought?.trim());

  let maturityScore = 0;
  if (meetsSpanOrAnchors) maturityScore += 0.35;
  if (!isStillDeveloping) maturityScore += 0.25;
  if (hasCompleteClaim) maturityScore += 0.2;
  maturityScore += topicStability * 0.2;
  if (!segmentOk) maturityScore *= 0.35;
  maturityScore = Math.min(1, Math.max(0, maturityScore));

  return {
    maturityScore,
    contextSpanSeconds,
    anchorCount,
    topicStability,
    isStillDeveloping,
    isActionableNow,
    segmentKind,
  };
}

/** Apply maturity fields onto a moment copy. */
export function withMomentMaturity(
  moment: ListenMoment,
  nowMs: number,
  segmentKind: ListenSegmentKind = "content",
): ListenMoment {
  const m = computeMomentMaturity(moment, nowMs, segmentKind);
  let status: ListenMomentStatus = moment.status;
  if (m.isStillDeveloping && status === "ready") status = "developing";
  if (m.isActionableNow && status === "developing" && m.maturityScore >= 0.72) status = "ready";
  return { ...moment, ...m, status };
}

export function isMomentMatureForSurface(moment: ListenMoment): boolean {
  return moment.isActionableNow === true && moment.isStillDeveloping !== true;
}
