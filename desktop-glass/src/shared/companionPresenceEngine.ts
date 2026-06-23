/**
 * Presence Engine — maps playback clock → active manifestations (Phase 3).
 */

import type { GuidanceManifestation, GuidancePlan } from "./companionGuidance.ts";
import { manifestationsForSegment } from "./companionGuidance.ts";
import type { SegmentTiming } from "./ttsAlignment.ts";
import { activeSegmentIndexAtTime } from "./ttsAlignment.ts";

export interface PresenceEngineState {
  plan: GuidancePlan;
  segmentTimings: SegmentTiming[];
  currentSegmentIndex: number;
  activeManifestations: GuidanceManifestation[];
}

export function createPresenceEngineState(
  plan: GuidancePlan,
  segmentTimings: SegmentTiming[],
): PresenceEngineState {
  const initialSegment = segmentTimings[0]?.segmentIndex ?? plan.speech[0]?.segmentIndex ?? 0;
  return {
    plan,
    segmentTimings,
    currentSegmentIndex: initialSegment,
    activeManifestations: manifestationsForSegment(plan, initialSegment),
  };
}

export function tickPresenceEngine(
  state: PresenceEngineState,
  currentSeconds: number,
): PresenceEngineState {
  const segmentIndex = activeSegmentIndexAtTime(state.segmentTimings, currentSeconds);
  if (segmentIndex === state.currentSegmentIndex) return state;
  return {
    ...state,
    currentSegmentIndex: segmentIndex,
    activeManifestations: manifestationsForSegment(state.plan, segmentIndex),
  };
}

/** Fallback when no TTS alignment — one segment per speech line, equal duration. */
export function estimateSegmentTimings(
  plan: GuidancePlan,
  totalDurationSeconds: number,
): SegmentTiming[] {
  const ordered = plan.speech.slice().sort((a, b) => a.segmentIndex - b.segmentIndex);
  if (!ordered.length) return [];
  const slice = totalDurationSeconds / ordered.length;
  return ordered.map((s, i) => ({
    segmentIndex: s.segmentIndex,
    startSeconds: i * slice,
    endSeconds: (i + 1) * slice,
  }));
}
