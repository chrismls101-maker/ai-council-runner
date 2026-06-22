/**
 * Merge local AX/DOM UiMap marks with vision model marks (Phase 2.5).
 */

import type { CompanionGuidancePayload, UiMap, UiMark } from "./companionGuidance.ts";

/** Prefer ax > dom > som > vision when ids collide. */
const SOURCE_RANK: Record<UiMark["source"], number> = {
  ax: 4,
  dom: 3,
  som: 2,
  vision: 1,
};

function markKey(mark: UiMark): string {
  return `${mark.label ?? ""}:${mark.bounds.x.toFixed(3)}:${mark.bounds.y.toFixed(3)}`;
}

/** Merge local marks ahead of model marks; dedupe near-identical regions. */
export function mergeUiMaps(local: UiMap | null | undefined, remote: UiMap): UiMap {
  if (!local?.marks.length) return remote;
  const merged: UiMark[] = [...local.marks];
  const seen = new Set(merged.map(markKey));
  for (const mark of remote.marks) {
    const key = markKey(mark);
    if (seen.has(key)) continue;
    const overlap = merged.some(
      (existing) =>
        existing.source !== "vision" &&
        Math.abs(existing.bounds.x - mark.bounds.x) < 0.02 &&
        Math.abs(existing.bounds.y - mark.bounds.y) < 0.02,
    );
    if (overlap && mark.source === "vision") continue;
    merged.push(mark);
    seen.add(key);
  }
  merged.sort((a, b) => SOURCE_RANK[b.source] - SOURCE_RANK[a.source]);
  return {
    captureId: remote.captureId || local.captureId,
    width: remote.width || local.width,
    height: remote.height || local.height,
    marks: merged.slice(0, 48),
  };
}

export function mergeCompanionGuidance(
  local: UiMap | null | undefined,
  remote: CompanionGuidancePayload | null | undefined,
): CompanionGuidancePayload | null {
  if (!remote) return null;
  if (!local?.marks.length) return remote;
  return {
    uiMap: mergeUiMaps(local, remote.uiMap),
    guidancePlan: remote.guidancePlan,
  };
}
