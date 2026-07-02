/**
 * Glass Guide — region presentation sequencer (ring + label + ghost + voice).
 *
 * Choreography rules:
 * - One TTS fetch per line; playback in the overlay; Skip cancels mid-word.
 * - The ring ignites on the word that names the region (character alignment),
 *   not at the start of the sentence.
 * - Ghost = hand (navigate/demonstrate only, glides from the user's cursor).
 *   Ring = gaze. Never both for the same instruction.
 * - 1.2s of silence after each spoken line before the session advances;
 *   Space advances immediately and cuts the audio.
 * - Every third region drops the label card — voice + ring stand alone.
 * - Sessions get quieter with proficiency (orientationSessionStyle).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { screen } from "electron";
import {
  ALETHEIA_GHOST_CLICK_MS,
  globalScreenToOverlayViewport,
} from "../shared/aletheiaGhostCursor.ts";
import {
  filterRegionsForSession,
  orientationSessionStyle,
  regionCenterScreenPx,
  buildOrientationSessionIntro,
  type OrientationActionOp,
  type OrientationGhostCursorState,
  type OrientationRegion,
  type OrientationSession,
  type OrientationSessionStyle,
  type OrientationShowRegionPayload,
} from "../shared/liveOrientationTypes.ts";
import { osClickCoordinates } from "./liveOrientationDisplay.ts";
import {
  scheduleOrientationSpeech,
  type OrientationTimedTtsFetch,
  type ScheduledOrientationSpeech,
} from "./liveOrientationTts.ts";
import {
  getAppProficiencyProfile,
  persistOrientationProfiles,
  recordRegionActionConfirmed,
  recordRegionPresented,
  recordSessionComplete,
} from "./liveOrientationMemory.ts";

const execFileAsync = promisify(execFile);
/** Hold on a silent region (quiet sessions) so the ring can be read. */
const REGION_HOLD_SILENT_MS = 4000;
/** Voice cadence — silence after each spoken line before advancing. */
const POST_LINE_SILENCE_MS = 1200;
/** Max we delay ring ignition waiting for the label word timestamp. */
const RING_SYNC_MAX_DELAY_MS = 4000;
const NAVIGATE_PAUSE_MS = 1000;
/** Ghost glide duration range (by distance). */
const GHOST_GLIDE_MIN_MS = 600;
const GHOST_GLIDE_MAX_MS = 900;

export type OrientationPresenterHost = {
  onShowRegion: (payload: OrientationShowRegionPayload) => void;
  onDismiss: () => void;
  onSessionState: (payload: { paused: boolean; currentIndex: number }) => void;
  onGhostCursor: (ghost: OrientationGhostCursorState | null) => void;
  fetchTts: OrientationTimedTtsFetch;
  getOverlayBounds: () => { x: number; y: number; width: number; height: number } | null;
  getDisplayBounds: () => { x: number; y: number; width: number; height: number };
  submitAsk: (text: string) => void;
  requestNavigateConfirm: (region: OrientationRegion) => Promise<boolean>;
  cancelNavigateConfirm: () => void;
  onSessionActiveChange?: (active: boolean) => void;
  /**
   * Re-validate cached geometry before a real click (Fix 12). Returns the
   * region to click (possibly re-mapped), or null when the target vanished.
   */
  validateRegionForClick?: (region: OrientationRegion) => Promise<OrientationRegion | null>;
};

let host: OrientationPresenterHost | null = null;
let activeSession: OrientationSession | null = null;
let sessionAbort: AbortController | null = null;
let paused = false;
let skipRegionRequested = false;
let skipAllRequested = false;
let currentSpeech: ScheduledOrientationSpeech | null = null;

export function configureOrientationPresenter(next: OrientationPresenterHost): void {
  host = next;
}

export function isOrientationSessionActive(): boolean {
  return activeSession != null;
}

export function getActiveOrientationSession(): OrientationSession | null {
  return activeSession;
}

export function requestSkipOrientationRegion(): void {
  skipRegionRequested = true;
  currentSpeech?.cancel();
}

export function requestSkipAllOrientation(): void {
  skipAllRequested = true;
  currentSpeech?.cancel();
  host?.cancelNavigateConfirm();
  sessionAbort?.abort();
}

export function requestPauseOrientation(): void {
  paused = true;
  host?.onSessionState({ paused: true, currentIndex: 0 });
}

export function requestResumeOrientation(): void {
  paused = false;
  host?.onSessionState({ paused: false, currentIndex: 0 });
}

export async function handleOrientationAction(input: {
  sessionId: string;
  regionId: string;
  op: OrientationActionOp;
}): Promise<void> {
  if (!activeSession || activeSession.sessionId !== input.sessionId) return;
  const region = activeSession.regions.find((r) => r.id === input.regionId);
  if (!region) return;

  switch (input.op) {
    case "skip":
      requestSkipOrientationRegion();
      break;
    case "open_in_glass":
      host?.submitAsk(
        `Explain this part of ${activeSession.appName} in more depth: ${region.label}. ${region.l1}`,
      );
      recordRegionActionConfirmed(activeSession.bundleId, region.id, activeSession.appName);
      requestSkipOrientationRegion();
      break;
    case "navigate_to": {
      const confirmed = host
        ? await host.requestNavigateConfirm(region)
        : false;
      if (confirmed) {
        await performRegionInteraction(region, true);
        recordRegionActionConfirmed(activeSession.bundleId, region.id, activeSession.appName);
      }
      requestSkipOrientationRegion();
      break;
    }
    case "demonstrate":
      await performRegionInteraction(region, false);
      recordRegionActionConfirmed(activeSession.bundleId, region.id, activeSession.appName);
      requestSkipOrientationRegion();
      break;
    default:
      break;
  }
}

async function speakLine(
  text: string,
  signal: AbortSignal,
): Promise<ScheduledOrientationSpeech | null> {
  if (!host || signal.aborted || skipAllRequested) return null;
  const speech = await scheduleOrientationSpeech(text, host.fetchTts, signal);
  currentSpeech = speech;
  return speech;
}

/** Wait for playback to end, then hold the voice-cadence silence. Space cuts both. */
async function waitSpeechThenSilence(
  speech: ScheduledOrientationSpeech | null,
  signal: AbortSignal,
): Promise<void> {
  if (speech) {
    await Promise.race([speech.done, waitForSkip(signal)]);
    if (signal.aborted || skipAllRequested || skipRegionRequested) {
      speech.cancel();
      return;
    }
  }
  await waitForAdvanceOrTimeout(speech ? POST_LINE_SILENCE_MS : REGION_HOLD_SILENT_MS, signal);
}

export async function runOrientationSession(
  session: OrientationSession,
  opts?: { forceIncludeRegionIds?: readonly string[] },
): Promise<void> {
  if (!host) return;
  if (activeSession) stopOrientationSession();

  activeSession = session;
  sessionAbort = new AbortController();
  paused = false;
  skipRegionRequested = false;
  skipAllRequested = false;
  host.onSessionActiveChange?.(true);

  const profile = getAppProficiencyProfile(session.bundleId);
  // Manual/stuck sessions get full presence; version-change re-orients present
  // the new regions quietly (session-2 style) regardless of proficiency.
  const style: OrientationSessionStyle =
    session.triggeredBy === "manual" || session.triggeredBy === "stuck"
      ? orientationSessionStyle(0)
      : session.partialReorient
        ? orientationSessionStyle(1)
        : orientationSessionStyle(profile?.sessionCount ?? 0);

  let regions = filterRegionsForSession(session.regions, profile, {
    partialReorient: session.partialReorient,
    forceIncludeRegionIds: opts?.forceIncludeRegionIds,
  });
  if (Number.isFinite(style.maxRegions)) {
    regions = regions.slice(0, Math.max(0, style.maxRegions));
  }

  if (regions.length === 0) {
    await finishSession(session, []);
    return;
  }

  const presentedIds: string[] = [];

  const isFirstVisit =
    !profile || profile.sessionCount === 0 || (profile.presentedRegions?.length ?? 0) === 0;
  const shouldSpeakIntro =
    !session.skipIntro
    && style.voice === "full"
    && (regions.length > 1 || session.triggeredBy === "manual" || session.triggeredBy === "new_app");
  if (shouldSpeakIntro) {
    const intro = buildOrientationSessionIntro(session.appName, session.windowTitle, isFirstVisit);
    const speech = await speakLine(intro, sessionAbort.signal);
    if (!sessionAbort.signal.aborted && !skipAllRequested) {
      await waitSpeechThenSilence(speech, sessionAbort.signal);
    }
  }

  for (let i = 0; i < regions.length; i += 1) {
    if (sessionAbort.signal.aborted || skipAllRequested) break;
    await waitWhilePaused(sessionAbort.signal);

    const region = regions[i]!;
    skipRegionRequested = false;

    // Every third region goes voice + ring only — uniform cards read as mechanical.
    const hideCard = !style.labelCards || (i + 1) % 3 === 0;
    const line = style.voice === "none" ? null : region.l1;

    const showRegion = (): void => {
      host?.onShowRegion({
        sessionId: session.sessionId,
        region,
        index: i,
        total: regions.length,
        hideCard,
      });
      host?.onSessionState({ paused: false, currentIndex: i });
    };

    let speech: ScheduledOrientationSpeech | null = null;
    if (line) {
      speech = await speakLine(line, sessionAbort.signal);
      if (sessionAbort.signal.aborted || skipAllRequested) break;
      // Ring ignites at the moment the region's name is spoken.
      const ringAtMs = speech?.timestampForPhrase(region.label) ?? 0;
      if (ringAtMs > 0) {
        await interruptibleDelay(Math.min(ringAtMs, RING_SYNC_MAX_DELAY_MS), sessionAbort.signal);
      }
    }
    showRegion();

    recordRegionPresented(session.bundleId, region.id, session.appName);
    presentedIds.push(region.id);

    await waitSpeechThenSilence(speech, sessionAbort.signal);
    if (sessionAbort.signal.aborted || skipAllRequested || skipRegionRequested) {
      host.onGhostCursor(null);
      continue;
    }

    const hasNavigateDemo = region.l4.some((action) => action.op === "navigate_to");
    const ghostAllowed =
      style.ghost === "full" || (style.ghost === "navigate_only" && hasNavigateDemo);
    if (hasNavigateDemo && ghostAllowed) {
      await performRegionInteraction(region, false, sessionAbort.signal);
      if (sessionAbort.signal.aborted || skipAllRequested || skipRegionRequested) {
        host.onGhostCursor(null);
        continue;
      }
    }

    host.onGhostCursor(null);
    await interruptibleDelay(150, sessionAbort.signal);
  }

  if (
    session.l2Guidance
    && style.voice !== "none"
    && !skipAllRequested
    && !sessionAbort.signal.aborted
  ) {
    const l2Region: OrientationRegion = {
      id: "l2-guidance",
      label: "One thing to know",
      bounds: { x: 0.25, y: 0.15, width: 0.5, height: 0.12 },
      priority: 0,
      role: "content",
      l1: session.l2Guidance,
      l2: null,
      l3: null,
      l4: [{ label: "Got it", op: "skip" }],
    };
    host.onShowRegion({
      sessionId: session.sessionId,
      region: l2Region,
      index: regions.length,
      total: regions.length + 1,
      l2Banner: session.l2Guidance,
      mode: "l2_final",
    });
    const speech = await speakLine(session.l2Guidance, sessionAbort.signal);
    await waitSpeechThenSilence(speech, sessionAbort.signal);
  }

  await finishSession(session, presentedIds);
}

export async function runSingleRegionOrientation(
  session: OrientationSession,
  region: OrientationRegion,
): Promise<void> {
  await runOrientationSession({
    ...session,
    regions: [region],
    l2Guidance: null,
  });
}

export function stopOrientationSession(): void {
  currentSpeech?.cancel();
  currentSpeech = null;
  host?.cancelNavigateConfirm();
  sessionAbort?.abort();
  sessionAbort = null;
  activeSession = null;
  paused = false;
  host?.onGhostCursor(null);
  host?.onDismiss();
  host?.onSessionActiveChange?.(false);
}

async function finishSession(session: OrientationSession, presentedIds: string[]): Promise<void> {
  currentSpeech?.cancel();
  currentSpeech = null;
  host?.cancelNavigateConfirm();
  host?.onGhostCursor(null);
  host?.onDismiss();
  activeSession = null;
  sessionAbort = null;
  host?.onSessionActiveChange?.(false);

  if (presentedIds.length === 0) return;

  const profile = getAppProficiencyProfile(session.bundleId);
  recordSessionComplete(
    session.bundleId,
    session.appName,
    presentedIds,
    session.userGoal,
    session.appVersion ?? profile?.lastAppVersion ?? null,
  );
  await persistOrientationProfiles();
}

/** Ghost glide duration by travel distance (px). */
export function ghostGlideMs(distancePx: number): number {
  const t = Math.max(0, Math.min(1, distancePx / 1200));
  return Math.round(GHOST_GLIDE_MIN_MS + t * (GHOST_GLIDE_MAX_MS - GHOST_GLIDE_MIN_MS));
}

async function performRegionInteraction(
  region: OrientationRegion,
  realClick: boolean,
  signal: AbortSignal = sessionAbort?.signal ?? new AbortController().signal,
): Promise<void> {
  if (!host || signal.aborted) return;

  // Fix 12 — never physically click stale coordinates.
  let target = region;
  if (realClick && host.validateRegionForClick) {
    const validated = await host.validateRegionForClick(region);
    if (signal.aborted) return;
    if (!validated) {
      host.onGhostCursor(null);
      return;
    }
    target = validated;
  }

  const display = host.getDisplayBounds();
  const center = regionCenterScreenPx(target, display);
  const overlayBounds = host.getOverlayBounds();
  if (!overlayBounds) return;

  // Ghost fades in at the user's actual cursor and glides — never teleports.
  const cursor = screen.getCursorScreenPoint();
  const from = globalScreenToOverlayViewport(cursor.x, cursor.y, overlayBounds);
  const to = globalScreenToOverlayViewport(center.x, center.y, overlayBounds);
  const glideMs = ghostGlideMs(Math.hypot(to.x - from.x, to.y - from.y));

  host.onGhostCursor({
    x: to.x,
    y: to.y,
    fromX: from.x,
    fromY: from.y,
    glideMs,
    phase: "approach",
  });
  await interruptibleDelay(glideMs + 120, signal);
  if (signal.aborted) return;

  host.onGhostCursor({ x: to.x, y: to.y, phase: "click" });
  await interruptibleDelay(ALETHEIA_GHOST_CLICK_MS, signal);
  if (signal.aborted) return;

  if (realClick && process.platform === "darwin") {
    try {
      const clickAt = osClickCoordinates(center.x, center.y);
      await execFileAsync("osascript", [
        "-e",
        `tell application "System Events" to click at {${clickAt.x}, ${clickAt.y}}`,
      ]);
      await interruptibleDelay(NAVIGATE_PAUSE_MS, signal);
    } catch {
      // accessibility may be denied
    }
  }

  host.onGhostCursor(null);
}

async function waitWhilePaused(signal: AbortSignal): Promise<void> {
  while (paused && !signal.aborted && !skipAllRequested) {
    await interruptibleDelay(200, signal);
  }
}

async function waitForSkip(signal: AbortSignal): Promise<void> {
  while (!signal.aborted && !skipAllRequested && !skipRegionRequested) {
    await delay(80);
  }
}

async function waitForAdvanceOrTimeout(ms: number, signal: AbortSignal): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (signal.aborted || skipAllRequested || skipRegionRequested) return;
    if (paused) {
      await interruptibleDelay(200, signal);
      continue;
    }
    await interruptibleDelay(100, signal);
  }
}

async function interruptibleDelay(ms: number, signal: AbortSignal): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (signal.aborted || skipAllRequested) return;
    await delay(Math.min(100, ms - (Date.now() - start)));
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
