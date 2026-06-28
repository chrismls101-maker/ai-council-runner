/**
 * GroundedUiState — merge AX, DOM, OmniParser marks into one target map.
 */

import type { NormalizedRect, UiMark, UiMarkSource } from "./companionGuidance.ts";

export interface GroundedUiCandidate {
  id: string;
  source: UiMarkSource | "screenshot";
  label: string;
  role?: string;
  bounds: NormalizedRect;
  confidence: number;
  actionability: number;
}

export interface GroundedUiState {
  captureId: string;
  width: number;
  height: number;
  activeApp?: string;
  windowTitle?: string;
  screenshotDigest?: string;
  candidates: GroundedUiCandidate[];
  capturedAt: number;
}

const SOURCE_CONFIDENCE: Record<UiMarkSource, number> = {
  dom: 0.92,
  ax: 0.85,
  som: 0.72,
  vision: 0.68,
};

function inferRole(label: string, source: UiMarkSource): string | undefined {
  const lower = label.toLowerCase();
  if (/\b(button|btn)\b/.test(lower) || source === "dom") return "button";
  if (/\b(link|url)\b/.test(lower)) return "link";
  if (/\b(input|field|search)\b/.test(lower)) return "textfield";
  if (source === "ax") return "element";
  return undefined;
}

function actionabilityFor(source: UiMarkSource, label: string): number {
  const base = SOURCE_CONFIDENCE[source];
  if (!label.trim()) return base * 0.55;
  if (label.length < 3) return base * 0.65;
  return Math.min(1, base + 0.05);
}

function overlapRatio(a: NormalizedRect, b: NormalizedRect): number {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function markToCandidate(mark: UiMark): GroundedUiCandidate {
  const label = mark.label?.trim() ?? mark.id;
  const confidence = SOURCE_CONFIDENCE[mark.source];
  return {
    id: mark.id,
    source: mark.source,
    label,
    role: inferRole(label, mark.source),
    bounds: mark.bounds,
    confidence,
    actionability: actionabilityFor(mark.source, label),
  };
}

/** Merge marks into a deduplicated candidate list (higher-confidence wins overlaps). */
export function mergeGroundedUiState(input: {
  captureId: string;
  width: number;
  height: number;
  activeApp?: string;
  windowTitle?: string;
  marks: UiMark[];
  screenshotDigest?: string;
  capturedAt?: number;
}): GroundedUiState {
  const sorted = [...input.marks]
    .map(markToCandidate)
    .sort((a, b) => b.confidence - a.confidence);

  const merged: GroundedUiCandidate[] = [];
  for (const candidate of sorted) {
    const duplicate = merged.find(
      (existing) =>
        overlapRatio(existing.bounds, candidate.bounds) > 0.55
        || existing.label.toLowerCase() === candidate.label.toLowerCase()
        && candidate.label.length > 2,
    );
    if (!duplicate) {
      merged.push(candidate);
    }
  }

  return {
    captureId: input.captureId,
    width: input.width,
    height: input.height,
    activeApp: input.activeApp,
    windowTitle: input.windowTitle,
    screenshotDigest: input.screenshotDigest,
    candidates: merged.slice(0, 48),
    capturedAt: input.capturedAt ?? Date.now(),
  };
}

export function findCandidateById(
  state: GroundedUiState,
  targetId: string | undefined,
): GroundedUiCandidate | undefined {
  if (!targetId) return undefined;
  return state.candidates.find((c) => c.id === targetId);
}

/** Keyword match score for planner-driven target selection. */
export function scoreCandidateForGoal(
  candidate: GroundedUiCandidate,
  keywords: string[],
): number {
  if (!keywords.length) return candidate.actionability;
  const label = candidate.label.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (kw.length >= 2 && label.includes(kw)) hits += 1;
  }
  return candidate.actionability + hits * 0.15;
}

export function extractGoalKeywords(goal: string): string[] {
  return goal
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)
    .filter((w) => !["the", "and", "for", "with", "that", "this", "open", "go"].includes(w));
}
