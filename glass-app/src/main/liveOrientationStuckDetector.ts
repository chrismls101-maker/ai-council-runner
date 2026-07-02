/**
 * Glass Guide — stuck pattern detection background loop.
 */

import { screen } from "electron";
import {
  fractionBoundsToScreenPx,
  type OrientationRegion,
  type OrientationStuckPromptPayload,
} from "../shared/liveOrientationTypes.ts";

const POLL_MS = 500;
const HOVER_STUCK_MS = 6000;
const BACK_LOOP_MS = 8000;
const REPEAT_CLICK_MS = 30_000;
const REPEAT_CLICK_COUNT = 3;
const LONG_DWELL_MS = 90_000;
const CLICK_COORD_TOLERANCE = 12;
/** Hover-stuck only fires on regions at most this fraction of the display area. */
const HOVER_STUCK_MAX_AREA_FRACTION = 0.15;
/** Roles eligible for hover-stuck — interactive surfaces only, never content/document panes. */
const HOVER_STUCK_ROLES = new Set<OrientationRegion["role"]>([
  "navigation",
  "action",
  "settings",
]);

export type StuckDetectorHost = {
  isEnabled: () => boolean;
  isSessionActive: () => boolean;
  onStuck: (payload: OrientationStuckPromptPayload) => void;
  getCachedRegions: () => OrientationRegion[];
  getDisplayBounds: () => { x: number; y: number; width: number; height: number };
  getWindowTitle: () => string | null;
  onStartSingleRegion: (regionId: string, label: string) => void;
  onBootstrapRegionsIfNeeded: () => void;
  onHoverWatchChange?: () => void;
};

export function isStuckDetectorHoverWatching(): boolean {
  return hoverWatching;
}

let host: StuckDetectorHost | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let hoverStart: number | null = null;
let hoverRegionId: string | null = null;
let hoverWatching = false;
let lastTitle: string | null = null;
let titleChangedAt = 0;
let titleBeforeBack: string | null = null;
const clickLog: Array<{ x: number; y: number; at: number }> = [];
let screenStableSince = Date.now();
let lastDigestTitle: string | null = null;
let stuckCooldownUntil = 0;
/** Per-region cooldown — the colleague glance never nags the same element. */
const regionCooldownUntil = new Map<string, number>();
const REGION_STUCK_COOLDOWN_MS = 3 * 60_000;

export function configureOrientationStuckDetector(next: StuckDetectorHost): void {
  host = next;
}

export function startOrientationStuckDetector(): void {
  if (pollTimer) return;
  pollTimer = setInterval(tickStuckDetector, POLL_MS);
}

export function stopOrientationStuckDetector(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  resetStuckState();
}

export function recordOrientationClick(x: number, y: number): void {
  const now = Date.now();
  clickLog.push({ x, y, at: now });
  while (clickLog.length > 0 && now - clickLog[0]!.at > REPEAT_CLICK_MS) {
    clickLog.shift();
  }
}

export function updateOrientationScreenDigest(title: string | null): void {
  if (title !== lastDigestTitle) {
    lastDigestTitle = title;
    screenStableSince = Date.now();
    // Confirmed user progress (title/app state change) resets the global cooldown.
    stuckCooldownUntil = 0;
  }
}

export function acceptStuckWalkthrough(regionId: string, label: string): void {
  host?.onStartSingleRegion(regionId, label);
  stuckCooldownUntil = Date.now() + 60_000;
}

function resetStuckState(): void {
  hoverStart = null;
  hoverRegionId = null;
  clickLog.length = 0;
  if (hoverWatching) {
    hoverWatching = false;
    host?.onHoverWatchChange?.();
  }
}

function setHoverWatching(watching: boolean): void {
  if (hoverWatching === watching) return;
  hoverWatching = watching;
  host?.onHoverWatchChange?.();
}

function tickStuckDetector(): void {
  if (!host?.isEnabled() || host.isSessionActive()) return;
  if (Date.now() < stuckCooldownUntil) return;

  const regions = host.getCachedRegions();
  if (regions.length === 0) {
    setHoverWatching(false);
    host.onBootstrapRegionsIfNeeded();
    return;
  }

  const cursor = screen.getCursorScreenPoint();
  const display = host.getDisplayBounds();
  const hovered = findRegionAtPoint(regions, cursor.x, cursor.y, display);
  const hoverEligible = hovered != null && isHoverStuckEligible(hovered);
  setHoverWatching(hoverEligible);

  // Hover-stuck applies only to small interactive regions — dwelling over a
  // content pane or sidebar is reading, not being stuck.
  if (hovered && hoverEligible && hovered.id === hoverRegionId) {
    if (!hoverStart) hoverStart = Date.now();
    if (Date.now() - hoverStart >= HOVER_STUCK_MS) {
      fireStuck(hovered.id, hovered.label);
      return;
    }
  } else {
    hoverRegionId = hovered && hoverEligible ? hovered.id : null;
    hoverStart = hovered && hoverEligible ? Date.now() : null;
  }

  const title = host.getWindowTitle();
  if (title !== lastTitle) {
    if (lastTitle && titleBeforeBack === title) {
      if (Date.now() - titleChangedAt < BACK_LOOP_MS) {
        // Target the region under the cursor — never default to regions[0].
        if (hovered) fireStuck(hovered.id, hovered.label);
        return;
      }
    }
    titleBeforeBack = lastTitle;
    lastTitle = title;
    titleChangedAt = Date.now();
  }

  const repeatAnchor = detectRepeatClicks();
  if (repeatAnchor) {
    const region = findRegionAtPoint(regions, repeatAnchor.x, repeatAnchor.y, display);
    if (region) fireStuck(region.id, region.label);
    return;
  }

  if (Date.now() - screenStableSince >= LONG_DWELL_MS) {
    const region = hovered ?? regions[0];
    if (region) fireStuck(region.id, region.label);
  }
}

function isHoverStuckEligible(region: OrientationRegion): boolean {
  if (!HOVER_STUCK_ROLES.has(region.role)) return false;
  const areaFraction = region.bounds.width * region.bounds.height;
  return areaFraction <= HOVER_STUCK_MAX_AREA_FRACTION;
}

function findRegionAtPoint(
  regions: OrientationRegion[],
  x: number,
  y: number,
  display: { x: number; y: number; width: number; height: number },
): OrientationRegion | null {
  for (const region of regions) {
    const px = fractionBoundsToScreenPx(region.bounds, display);
    if (
      x >= px.x
      && x <= px.x + px.width
      && y >= px.y
      && y <= px.y + px.height
    ) {
      return region;
    }
  }
  return null;
}

/** Anchor coordinates of a repeat-click cluster, or null when no cluster exists. */
function detectRepeatClicks(): { x: number; y: number } | null {
  if (clickLog.length < REPEAT_CLICK_COUNT) return null;
  for (let i = 0; i < clickLog.length; i += 1) {
    const anchor = clickLog[i]!;
    const cluster = clickLog.filter(
      (c) =>
        Math.abs(c.x - anchor.x) <= CLICK_COORD_TOLERANCE
        && Math.abs(c.y - anchor.y) <= CLICK_COORD_TOLERANCE
        && anchor.at - c.at <= REPEAT_CLICK_MS,
    );
    if (cluster.length >= REPEAT_CLICK_COUNT) return { x: anchor.x, y: anchor.y };
  }
  return null;
}

function fireStuck(regionId: string, regionLabel: string): void {
  const now = Date.now();
  if ((regionCooldownUntil.get(regionId) ?? 0) > now) return;
  regionCooldownUntil.set(regionId, now + REGION_STUCK_COOLDOWN_MS);
  stuckCooldownUntil = now + 45_000;
  // Reset screen stability so long-dwell cannot refire until a fresh 90s of stability.
  screenStableSince = now;
  resetStuckState();
  host?.onStuck({ regionId, regionLabel });
}
