/**
 * Glass Guide — orchestrates trigger → map → intelligence → present.
 */

import { randomUUID } from "node:crypto";
import { screen } from "electron";
import type { GlassUserSettings } from "../shared/glassSettings.ts";
import type { GlassContextProfile } from "../shared/glassContextEngine.ts";
import type {
  OrientationGhostCursorState,
  OrientationOfferPayload,
  OrientationSession,
  OrientationShowRegionPayload,
  OrientationStuckPromptPayload,
  OrientationRegion,
  DisplayBounds,
} from "../shared/liveOrientationTypes.ts";
import { orientationSessionStyle } from "../shared/liveOrientationTypes.ts";
import { globalScreenToOverlayViewport } from "../shared/aletheiaGhostCursor.ts";
import { bundleIdFromAppName, getFrontmostAppIdentity, type FrontmostAppIdentity } from "./appIdentity.ts";
import { extractUserGoalFromContext, inferUserRoleFromContext, looksLikeOrientationGoal } from "./liveOrientationGoal.ts";
import { mapOrientationRegions } from "./liveOrientationMapper.ts";
import { enrichOrientationRegions, selectRegionsForGoal } from "./liveOrientationIntelligence.ts";
import { getCursorDisplayBounds } from "./liveOrientationDisplay.ts";
import {
  startOrientationClickPoll,
  stopOrientationClickPoll,
  syncOrientationClickWatch,
} from "./liveOrientationClickPoll.ts";
import {
  refreshOrientationGlobalShortcuts,
  unregisterOrientationGlobalShortcuts,
} from "./liveOrientationShortcuts.ts";
import {
  configureOrientationPresenter,
  getActiveOrientationSession,
  handleOrientationAction,
  isOrientationSessionActive,
  requestPauseOrientation,
  requestResumeOrientation,
  requestSkipAllOrientation,
  requestSkipOrientationRegion,
  runOrientationSession,
  runSingleRegionOrientation,
  stopOrientationSession,
  type OrientationPresenterHost,
} from "./liveOrientationPresenter.ts";
import {
  acceptStuckWalkthrough,
  configureOrientationStuckDetector,
  startOrientationStuckDetector,
  stopOrientationStuckDetector,
  updateOrientationScreenDigest,
} from "./liveOrientationStuckDetector.ts";
import {
  evaluateOrientationTrigger,
  onAppFocusChanged,
} from "./liveOrientationTrigger.ts";
import {
  loadOrientationProfiles,
  cacheOrientationRegionLabels,
  getAppProficiencyProfile,
  getOrientationRegionLabel,
} from "./liveOrientationMemory.ts";
import { regionsToResurface, buildOrientationGoalAck, formatOrientationPlace } from "../shared/liveOrientationTypes.ts";
import {
  configureOrientationSpeechTransport,
  scheduleOrientationSpeech,
  type OrientationTimedTtsFetch,
} from "./liveOrientationTts.ts";
import {
  isRegionGeometryValid,
  ORIENTATION_REGION_STALE_MS,
} from "./liveOrientationGeometry.ts";
import { captureForTextOverlay } from "./textOverlayCapture.ts";
import { remapSingleOrientationRegion } from "./liveOrientationMapper.ts";
import { subscribeKeystrokeMonitor } from "./glassTypingKeystrokeMonitor.ts";
import type { OrientationActionPayload, OrientationSkipPayload } from "../shared/liveOrientationTypes.ts";
import { isAletheiaComputerOperatorRunning } from "./aletheiaComputerOperatorRunner.ts";

export type LiveOrientationHost = {
  isEnabled: () => boolean;
  getSettings: () => GlassUserSettings;
  getContextProfile: () => GlassContextProfile | null;
  getScrollbackSummary: () => Promise<string | null>;
  getWindowTitle: () => string | null;
  screenCaptureReady: () => boolean;
  broadcast: (channel: string, payload?: unknown) => void;
  pushState: (patch: Record<string, unknown>) => void;
  fetchTts: OrientationTimedTtsFetch;
  getOverlayBounds: () => { x: number; y: number; width: number; height: number } | null;
  submitAsk: (text: string) => void;
  IPC: {
    orientationShowRegion: string;
    orientationDismiss: string;
    orientationSessionState: string;
    orientationStuckPrompt: string;
    orientationOffer: string;
    orientationSpeak: string;
    orientationSpeechCancel: string;
  };
  /** When false, defer auto-orient and stuck bootstrap until Glass chrome boot finishes. */
  isAutoTriggerReady?: () => boolean;
};

let host: LiveOrientationHost | null = null;
let triggersActive = false;
let lastBundleId: string | null = null;
type BundleRegionCache = {
  regions: OrientationRegion[];
  displayBounds: DisplayBounds;
  /** Screenshot from mapping time — used for geometry re-validation. */
  imageDataUrl: string | null;
  mappedAt: number;
};
const regionsCacheByBundle = new Map<string, BundleRegionCache>();
let activeOrientationDisplayBounds: DisplayBounds | null = null;
let pendingNavigateResolve: ((v: boolean) => void) | null = null;
let pipelineBusy = false;
let focusRetryTimer: ReturnType<typeof setTimeout> | null = null;
let focusRetryBundleId: string | null = null;
const bootstrapCompletedBundles = new Set<string>();
let bootstrapInFlight: string | null = null;
let bootstrapPending = false;
let pendingOrientationGoal: string | null = null;

function isOrientationAutoTriggerReady(): boolean {
  if (!host) return false;
  if (host.isAutoTriggerReady && !host.isAutoTriggerReady()) return false;
  return true;
}

function setBundleRegionCache(
  bundleId: string,
  regions: OrientationRegion[],
  displayBounds: DisplayBounds,
  imageDataUrl: string | null = null,
): void {
  regionsCacheByBundle.set(bundleId, {
    regions,
    displayBounds,
    imageDataUrl,
    mappedAt: Date.now(),
  });
  cacheOrientationRegionLabels(bundleId, regions);
}

function getBundleRegionCache(bundleId: string): BundleRegionCache | null {
  return regionsCacheByBundle.get(bundleId) ?? null;
}

function getCachedRegionsForBundle(bundleId: string | null): OrientationRegion[] {
  if (!bundleId) return [];
  return regionsCacheByBundle.get(bundleId)?.regions ?? [];
}

function resolveOrientationDisplayBounds(): DisplayBounds {
  if (activeOrientationDisplayBounds) return activeOrientationDisplayBounds;
  if (lastBundleId) {
    const cache = regionsCacheByBundle.get(lastBundleId);
    if (cache) return cache.displayBounds;
  }
  return getCursorDisplayBounds();
}

function cancelPendingNavigateConfirm(confirmed = false): void {
  pendingNavigateResolve?.(confirmed);
  pendingNavigateResolve = null;
  host?.pushState({ orientationNavigateConfirm: null });
}

function clearFocusRetryTimer(): void {
  if (focusRetryTimer) {
    clearTimeout(focusRetryTimer);
    focusRetryTimer = null;
  }
  focusRetryBundleId = null;
}

function scheduleFocusGateRetry(identity: FrontmostAppIdentity, remainingMs: number): void {
  if (remainingMs <= 0) return;
  if (focusRetryBundleId === identity.bundleId && focusRetryTimer) return;
  clearFocusRetryTimer();
  focusRetryBundleId = identity.bundleId;
  focusRetryTimer = setTimeout(() => {
    focusRetryTimer = null;
    void (async () => {
      if (!host?.isEnabled() || !triggersActive) return;
      const current = await getFrontmostAppIdentity();
      if (!current || current.bundleId !== focusRetryBundleId) return;
      await handleAppFocusForOrientation(current);
    })();
  }, remainingMs + 80);
}

export function configureLiveOrientation(next: LiveOrientationHost): void {
  host = next;

  // Single-fetch TTS: main fetches once, the overlay decodes + plays, and a
  // cancel broadcast stops audio mid-word.
  configureOrientationSpeechTransport({
    play: (payload) => {
      host?.broadcast(host.IPC.orientationSpeak, payload);
    },
    cancel: (nonce) => {
      host?.broadcast(host.IPC.orientationSpeechCancel, nonce);
    },
  });

  const presenterHost: OrientationPresenterHost = {
    onShowRegion: (payload: OrientationShowRegionPayload) => {
      host?.broadcast(host.IPC.orientationShowRegion, payload);
    },
    onDismiss: () => {
      host?.broadcast(host.IPC.orientationDismiss);
      host?.pushState({ orientationGhostCursor: null, orientationNavigateConfirm: null });
    },
    onSessionState: (payload) => {
      host?.broadcast(host.IPC.orientationSessionState, payload);
    },
    onGhostCursor: (ghost: OrientationGhostCursorState | null) => {
      host?.pushState({ orientationGhostCursor: ghost });
    },
    fetchTts: next.fetchTts,
    getOverlayBounds: next.getOverlayBounds,
    getDisplayBounds: () => resolveOrientationDisplayBounds(),
    submitAsk: next.submitAsk,
    validateRegionForClick: (region) => validateRegionGeometryForClick(region),
    requestNavigateConfirm: (region) => {
      if (host?.getSettings().glassGuideAutoActions) {
        return Promise.resolve(true);
      }
      return new Promise((resolve) => {
        cancelPendingNavigateConfirm(false);
        pendingNavigateResolve = resolve;
        host?.pushState({
          orientationNavigateConfirm: {
            regionId: region.id,
            label: region.label,
            nonce: Date.now(),
          },
        });
      });
    },
    cancelNavigateConfirm: () => cancelPendingNavigateConfirm(false),
    onSessionActiveChange: (active) => {
      if (!active) activeOrientationDisplayBounds = null;
      refreshOrientationGlobalShortcuts(active && Boolean(host?.isEnabled()));
      syncOrientationClickWatch();
    },
  };

  configureOrientationPresenter(presenterHost);

  configureOrientationStuckDetector({
    isEnabled: () => Boolean(host?.isEnabled()),
    isSessionActive: () => isOrientationSessionActive(),
    onStuck: (payload: OrientationStuckPromptPayload) => {
      void runStuckColleagueGlance(payload);
    },
    getCachedRegions: () => getCachedRegionsForBundle(lastBundleId),
    getDisplayBounds: () => resolveOrientationDisplayBounds(),
    getWindowTitle: () => host?.getWindowTitle() ?? null,
    onStartSingleRegion: (regionId, label) => {
      void startSingleRegionSession(regionId, label);
    },
    onBootstrapRegionsIfNeeded: () => {
      void bootstrapRegionsForStuckDetector();
    },
    onHoverWatchChange: () => {
      syncOrientationClickWatch();
    },
  });
}

export async function startLiveOrientation(): Promise<void> {
  if (triggersActive) return;
  triggersActive = true;
  await loadOrientationProfiles();
  startOrientationStuckDetector();
  startOrientationClickPoll();
}

export function stopLiveOrientation(): void {
  triggersActive = false;
  clearFocusRetryTimer();
  clearPendingOffer();
  glanceCancel?.();
  cancelPendingNavigateConfirm(false);
  stopOrientationStuckDetector();
  stopOrientationClickPoll();
  unregisterOrientationGlobalShortcuts();
  stopOrientationSession();
  regionsCacheByBundle.clear();
  bootstrapCompletedBundles.clear();
  bootstrapInFlight = null;
  activeOrientationDisplayBounds = null;
}

export async function orientCurrentAppIfEnabled(): Promise<void> {
  if (!host?.isEnabled() || !triggersActive || !isOrientationAutoTriggerReady()) return;
  const identity = await getFrontmostAppIdentity();
  if (!identity) return;
  notifyOrientationWindowTitle(host.getWindowTitle());
  await handleAppFocusForOrientation(identity);
}

export async function handleAppFocusForOrientation(
  identity?: FrontmostAppIdentity | null,
): Promise<void> {
  if (!host?.isEnabled() || !triggersActive || pipelineBusy) return;
  if (!isOrientationAutoTriggerReady()) return;
  if (isAletheiaComputerOperatorRunning()) return;

  const resolved = identity ?? await getFrontmostAppIdentity();
  if (!resolved) return;

  if (lastBundleId) onAppFocusChanged(lastBundleId, resolved);
  lastBundleId = resolved.bundleId;

  const decision = evaluateOrientationTrigger({
    identity: resolved,
    screenCaptureReady: host.screenCaptureReady(),
    privacyApps: host.getSettings().textOverlayPrivacyApps,
  });

  if (decision.blockedByFocusGate) {
    scheduleFocusGateRetry(resolved, decision.focusGateRemainingMs ?? 0);
    return;
  }

  clearFocusRetryTimer();

  if (!decision.shouldFire || !decision.reason) return;

  // Never auto-start a tour — offer a quiet opt-in pill instead. Space/click
  // starts the session; typing, Esc, or 8s of silence dissolves it.
  broadcastOrientationOffer(resolved, {
    reason: decision.reason,
    partialReorient: decision.partialReorient,
    profile: decision.profile,
  });
}

export async function triggerManualOrientation(): Promise<void> {
  if (!host?.isEnabled()) return;
  if (isAletheiaComputerOperatorRunning()) return;
  if (isOrientationSessionActive()) stopOrientationSession();

  let identity = await getFrontmostAppIdentity();
  if (!identity && process.env.IIVO_GLASS_E2E === "1") {
    identity = resolveIdentityFromAppName("Notion");
  }
  if (!identity) return;

  clearFocusRetryTimer();

  const decision = evaluateOrientationTrigger({
    identity,
    manual: true,
    screenCaptureReady: host.screenCaptureReady(),
    privacyApps: host.getSettings().textOverlayPrivacyApps,
  });

  await runOrientationPipeline(
    {
      identity,
      triggeredBy: decision.reason ?? "manual",
      partialReorient: decision.partialReorient,
      profile: decision.profile,
    },
    { manual: true },
  );
}

async function runOrientationPipeline(
  input: {
    identity: FrontmostAppIdentity;
    triggeredBy: OrientationSession["triggeredBy"];
    partialReorient: boolean;
    profile: import("../shared/liveOrientationTypes.ts").AppProficiencyProfile | null;
  },
  opts?: { manual?: boolean },
): Promise<void> {
  if (!host) return;
  if (pipelineBusy && !opts?.manual) return;
  if (isAletheiaComputerOperatorRunning()) return;

  pipelineBusy = true;

  try {
    const settings = host.getSettings();
    const contextProfile = host.getContextProfile();
    const scrollbackSummary = await host.getScrollbackSummary();
    const inferredGoal = extractUserGoalFromContext({ contextProfile, scrollbackSummary });
    const userGoal = pendingOrientationGoal?.trim() ?? inferredGoal;
    const userRole = inferUserRoleFromContext(contextProfile, settings.persona ?? null)
      ?? input.profile?.inferredUserRole
      ?? null;

    const resurfaceIds = input.profile ? regionsToResurface(input.profile) : [];
    const knownRegions = (input.profile?.knownRegions ?? []).filter(
      (id) => !resurfaceIds.includes(id),
    );

    const mapped = await mapOrientationRegions({
      appName: input.identity.appName,
      userRole,
      userGoal,
      knownRegions,
      partialReorient: input.partialReorient,
      forceIncludeRegions: resurfaceIds,
      settings,
    });

    let regions = mapped.regions;
    if (regions.length === 0) {
      host.pushState({
        lastNotice:
          "Glass Guide could not map this app — check Screen Recording permission, Anthropic API key, and that the app window is visible.",
      });
      return;
    }

    const enriched = await enrichOrientationRegions({
      regions,
      imageDataUrl: mapped.imageDataUrl,
      appName: input.identity.appName,
      userRole,
      userGoal,
      profile: input.profile,
    });

    regions = enriched.regions;
    setBundleRegionCache(input.identity.bundleId, regions, mapped.displayBounds, mapped.imageDataUrl);
    activeOrientationDisplayBounds = mapped.displayBounds;

    let sessionGoal = userGoal ?? pendingOrientationGoal;
    if (pendingOrientationGoal?.trim()) {
      regions = await selectRegionsForGoal({
        regions,
        appName: input.identity.appName,
        userGoal: pendingOrientationGoal.trim(),
      });
      sessionGoal = pendingOrientationGoal.trim();
      pendingOrientationGoal = null;
    }

    const session: OrientationSession = {
      sessionId: randomUUID(),
      appName: input.identity.appName,
      bundleId: input.identity.bundleId,
      triggeredBy: input.triggeredBy,
      regions,
      userRole,
      userGoal: sessionGoal,
      startedAt: Date.now(),
      l2Guidance: enriched.l2Guidance,
      partialReorient: input.partialReorient,
      appVersion: input.identity.appVersion,
      windowTitle: host.getWindowTitle(),
    };

    await runOrientationSession(session, {
      forceIncludeRegionIds: opts?.manual
        ? regions.map((r) => r.id)
        : resurfaceIds,
    });
  } finally {
    pipelineBusy = false;
  }
}

/**
 * Fix 12 — before any real click, re-capture the region area and verify the
 * cached geometry still matches. Stale or visually-diverged regions are
 * re-mapped (single region) before the click; null when the target vanished.
 */
async function validateRegionGeometryForClick(
  region: OrientationRegion,
): Promise<OrientationRegion | null> {
  if (!host || !lastBundleId) return region;
  if (process.env.IIVO_GLASS_E2E === "1") return region;
  const cache = getBundleRegionCache(lastBundleId);
  if (!cache) return region;

  const fresh = Date.now() - cache.mappedAt <= ORIENTATION_REGION_STALE_MS;

  const capture = await captureForTextOverlay({
    displayTarget: host.getSettings().displayTarget,
    mode: "full",
    hideGlassChrome: false,
  });
  if (!capture) return fresh ? region : null;

  const valid = isRegionGeometryValid({
    region,
    mappedImageDataUrl: cache.imageDataUrl,
    mappedAt: cache.mappedAt,
    currentImageDataUrl: capture.imageDataUrl,
  });
  if (valid && fresh) return region;

  const identity = await getFrontmostAppIdentity();
  const settings = host.getSettings();
  const remapped = await remapSingleOrientationRegion(region.id, {
    appName: identity?.appName ?? cache.regions[0]?.label ?? "this app",
    userRole: null,
    userGoal: null,
    knownRegions: [],
    settings,
  });
  if (!remapped) return valid ? region : null;

  // Refresh the cache entry for this region so subsequent clicks stay valid.
  const nextRegions = cache.regions.map((r) => (r.id === region.id ? { ...r, bounds: remapped.bounds } : r));
  setBundleRegionCache(lastBundleId, nextRegions, cache.displayBounds, capture.imageDataUrl);
  return { ...region, bounds: remapped.bounds };
}

// ── Session opt-in pill ───────────────────────────────────────────────────────

type PendingOrientationOffer = {
  offerId: string;
  identity: FrontmostAppIdentity;
  triggeredBy: OrientationSession["triggeredBy"];
  partialReorient: boolean;
  profile: import("../shared/liveOrientationTypes.ts").AppProficiencyProfile | null;
  cleanup: () => void;
};

let pendingOffer: PendingOrientationOffer | null = null;
const OFFER_TIMEOUT_MS = 8_000;

function clearPendingOffer(broadcastClear = true): void {
  if (!pendingOffer) return;
  pendingOffer.cleanup();
  pendingOffer = null;
  if (broadcastClear) host?.broadcast(host.IPC.orientationOffer, null);
}

/**
 * Replace auto-started tours with a quiet opt-in pill. If the user starts
 * working, presses a key, or lets it sit, it dissolves into background stance.
 */
function broadcastOrientationOffer(
  identity: FrontmostAppIdentity,
  decision: {
    reason: OrientationSession["triggeredBy"];
    partialReorient: boolean;
    profile: import("../shared/liveOrientationTypes.ts").AppProficiencyProfile | null;
  },
): void {
  if (!host || pendingOffer || isOrientationSessionActive()) return;

  const profile = decision.profile;
  const style = orientationSessionStyle(profile?.sessionCount ?? 0);
  const continueGoal = profile?.goalHistory.length
    ? profile.goalHistory[profile.goalHistory.length - 1]
    : null;
  const resurfaceIds = profile ? regionsToResurface(profile) : [];
  const resurfaceRegionLabel = resurfaceIds.length > 0
    ? getOrientationRegionLabel(identity.bundleId, resurfaceIds[0]!) ?? resurfaceIds[0]!
    : null;

  const offerId = randomUUID();
  const payload: OrientationOfferPayload = {
    offerId,
    appName: identity.appName,
    continueGoal,
    resurfaceRegionLabel,
    note: style.startNote,
    timeoutMs: OFFER_TIMEOUT_MS,
  };

  // Typing means "I'm working" — the pill dissolves without a decision.
  const unsubKey = subscribeKeystrokeMonitor("orientation-offer", () => clearPendingOffer());
  const timeout = setTimeout(() => clearPendingOffer(), OFFER_TIMEOUT_MS + 500);

  pendingOffer = {
    offerId,
    identity,
    triggeredBy: decision.reason,
    partialReorient: decision.partialReorient,
    profile,
    cleanup: () => {
      unsubKey();
      clearTimeout(timeout);
    },
  };
  host.broadcast(host.IPC.orientationOffer, payload);
}

export function handleOrientationOfferResponse(offerId: string, accept: boolean): void {
  if (!pendingOffer || pendingOffer.offerId !== offerId) return;
  const offer = pendingOffer;
  clearPendingOffer(false);
  host?.broadcast(host.IPC.orientationOffer, null);
  if (!accept) return;
  void runOrientationPipeline({
    identity: offer.identity,
    triggeredBy: offer.triggeredBy,
    partialReorient: offer.partialReorient,
    profile: offer.profile,
  });
}

// ── Stuck response — the colleague glance ────────────────────────────────────

let glanceCancel: (() => void) | null = null;
const GLANCE_MOVE_AWAY_PX = 80;
const GLANCE_LINGER_AFTER_SPEECH_MS = 6_000;

function buildStuckGlanceLine(region: OrientationRegion): string {
  const l1 = region.l1.trim().replace(/\.$/, "");
  return `${region.label} — ${l1}. Want me to walk you through it?`;
}

/**
 * The stuck response: nothing visible at detection; a beat later the ghost
 * fades in *with the user* (at their cursor), one quiet line names the element,
 * the ring ignites softly. Moving on is the answer — any movement, click, or
 * keystroke dissolves it. No buttons, no modal.
 */
async function runStuckColleagueGlance(payload: OrientationStuckPromptPayload): Promise<void> {
  if (!host?.isEnabled() || glanceCancel || pipelineBusy || isOrientationSessionActive()) return;
  const regions = getCachedRegionsForBundle(lastBundleId);
  const region = regions.find((r) => r.id === payload.regionId);
  if (!region) return;

  let dissolved = false;
  let speechCancel: (() => void) | null = null;
  const cleanups: Array<() => void> = [];
  const dissolve = (): void => {
    if (dissolved) return;
    dissolved = true;
    for (const fn of cleanups) fn();
    speechCancel?.();
    glanceCancel = null;
    host?.pushState({ orientationGhostCursor: null });
    host?.broadcast(host.IPC.orientationDismiss);
  };
  glanceCancel = dissolve;

  // T+0 → T+1s: nothing visible (silent pre-compute beat).
  await new Promise((r) => setTimeout(r, 1_000));
  if (dissolved || !host || isOrientationSessionActive()) {
    if (!dissolved) dissolve();
    return;
  }

  const cursorStart = screen.getCursorScreenPoint();
  const overlayBounds = host.getOverlayBounds();
  if (overlayBounds) {
    const vp = globalScreenToOverlayViewport(cursorStart.x, cursorStart.y, overlayBounds);
    host.pushState({ orientationGhostCursor: { x: vp.x, y: vp.y, phase: "approach" } });
  }

  const line = buildStuckGlanceLine(region);
  host.broadcast(host.IPC.orientationShowRegion, {
    sessionId: `stuck-glance-${Date.now()}`,
    region,
    index: 0,
    total: 1,
    hideCard: true,
  } satisfies OrientationShowRegionPayload);
  host.broadcast(host.IPC.orientationStuckPrompt, {
    ...payload,
    mode: "glance",
    line,
  } satisfies OrientationStuckPromptPayload);

  // Moving away is the answer.
  const moveWatcher = setInterval(() => {
    const now = screen.getCursorScreenPoint();
    if (Math.hypot(now.x - cursorStart.x, now.y - cursorStart.y) > GLANCE_MOVE_AWAY_PX) {
      dissolve();
    }
  }, 150);
  cleanups.push(() => clearInterval(moveWatcher));
  cleanups.push(subscribeKeystrokeMonitor("stuck-glance", () => dissolve()));

  const speech = await scheduleOrientationSpeech(line, host.fetchTts);
  if (dissolved) {
    speech.cancel();
    return;
  }
  speechCancel = speech.cancel;

  await speech.done;
  if (dissolved) return;
  const linger = setTimeout(() => dissolve(), GLANCE_LINGER_AFTER_SPEECH_MS);
  cleanups.push(() => clearTimeout(linger));
}

async function startSingleRegionSession(regionId: string, label: string): Promise<void> {
  if (!host || isAletheiaComputerOperatorRunning()) return;
  const identity = await getFrontmostAppIdentity();
  if (!identity) return;

  const cache = getBundleRegionCache(identity.bundleId);
  const region = cache?.regions.find((r) => r.id === regionId)
    ?? cache?.regions[0];
  if (!region) return;

  if (cache?.displayBounds) {
    activeOrientationDisplayBounds = cache.displayBounds;
  }

  const session: OrientationSession = {
    sessionId: randomUUID(),
    appName: identity.appName,
    bundleId: identity.bundleId,
    triggeredBy: "stuck",
    regions: [{ ...region, label: label || region.label }],
    userRole: null,
    userGoal: null,
    startedAt: Date.now(),
  };

  await runSingleRegionOrientation(session, session.regions[0]!);
}

async function bootstrapRegionsForStuckDetector(): Promise<void> {
  if (!host?.isEnabled() || !triggersActive || !isOrientationAutoTriggerReady()) return;
  if (bootstrapPending || pipelineBusy || isOrientationSessionActive()) return;
  if (!host.screenCaptureReady() && process.env.IIVO_GLASS_E2E !== "1") return;

  bootstrapPending = true;
  try {
    const identity = await getFrontmostAppIdentity();
    if (!identity) return;
    const cache = getBundleRegionCache(identity.bundleId);
    if (cache && cache.regions.length > 0) return;
    await bootstrapOrientationRegionsSilent(identity);
  } finally {
    bootstrapPending = false;
  }
}

async function bootstrapOrientationRegionsSilent(
  identity: FrontmostAppIdentity,
): Promise<void> {
  if (!host) return;
  const existing = getBundleRegionCache(identity.bundleId);
  if (existing && existing.regions.length > 0) return;
  if (bootstrapCompletedBundles.has(identity.bundleId)) return;
  if (bootstrapInFlight === identity.bundleId) return;
  if (pipelineBusy || isOrientationSessionActive()) return;

  bootstrapInFlight = identity.bundleId;
  try {
    const settings = host.getSettings();
    const profile = getAppProficiencyProfile(identity.bundleId);
    const contextProfile = host.getContextProfile();
    const scrollbackSummary = await host.getScrollbackSummary();
    const userGoal = extractUserGoalFromContext({ contextProfile, scrollbackSummary });
    const userRole = inferUserRoleFromContext(contextProfile, settings.persona ?? null)
      ?? profile?.inferredUserRole
      ?? null;

    const resurfaceIds = profile ? regionsToResurface(profile) : [];
    const knownRegions = (profile?.knownRegions ?? []).filter(
      (id) => !resurfaceIds.includes(id),
    );

    const mapped = await mapOrientationRegions({
      appName: identity.appName,
      userRole,
      userGoal,
      knownRegions,
      partialReorient: false,
      forceIncludeRegions: resurfaceIds,
      settings,
    });

    if (mapped.regions.length > 0) {
      setBundleRegionCache(identity.bundleId, mapped.regions, mapped.displayBounds, mapped.imageDataUrl);
    }
    bootstrapCompletedBundles.add(identity.bundleId);
  } catch {
    bootstrapCompletedBundles.add(identity.bundleId);
  } finally {
    if (bootstrapInFlight === identity.bundleId) {
      bootstrapInFlight = null;
    }
  }
}

export function handleOrientationSkip(payload: OrientationSkipPayload): void {
  switch (payload.kind) {
    case "all":
      cancelPendingNavigateConfirm(false);
      requestSkipAllOrientation();
      break;
    case "region":
      requestSkipOrientationRegion();
      break;
    case "pause":
      requestPauseOrientation();
      break;
    case "resume":
      requestResumeOrientation();
      break;
    default:
      break;
  }
}

export function handleOrientationActionRequest(payload: OrientationActionPayload): void {
  void handleOrientationAction(payload);
}

export function handleOrientationNavigateConfirm(confirmed: boolean): void {
  cancelPendingNavigateConfirm(confirmed);
}

export function handleOrientationStuckResponse(accept: boolean, regionId: string, label: string): void {
  glanceCancel?.();
  if (accept) acceptStuckWalkthrough(regionId, label);
}

export function notifyOrientationWindowTitle(title: string | null): void {
  updateOrientationScreenDigest(title);
}

export function resolveIdentityFromAppName(appName: string): FrontmostAppIdentity {
  return {
    appName,
    bundleId: bundleIdFromAppName(appName),
    appVersion: null,
  };
}

export function isLiveOrientationBusy(): boolean {
  return pipelineBusy || isOrientationSessionActive();
}

export async function tryHandleOrientationGoal(rawText: string): Promise<boolean> {
  if (!host?.isEnabled() || !triggersActive) return false;
  const goal = rawText.trim();
  if (!looksLikeOrientationGoal(goal)) return false;

  const identity = await getFrontmostAppIdentity();
  if (!identity) return false;

  const active = getActiveOrientationSession();
  const cache = getBundleRegionCache(identity.bundleId);
  const baseRegions = active?.regions ?? cache?.regions;
  if (!baseRegions?.length) {
    pendingOrientationGoal = goal;
    host.pushState({
      lastNotice: `Got it — "${goal}". Mapping the screen…`,
    });
    if (!pipelineBusy) void orientCurrentAppIfEnabled();
    return true;
  }

  const filtered = await selectRegionsForGoal({
    regions: baseRegions,
    appName: identity.appName,
    userGoal: goal,
  });
  if (filtered.length === 0) return false;

  stopOrientationSession();

  const ack = buildOrientationGoalAck(
    goal,
    formatOrientationPlace(identity.appName, host.getWindowTitle()),
  );
  host.pushState({
    aletheiaEphemeralSpeak: {
      text: ack,
      nonce: Date.now(),
    },
  });

  const session: OrientationSession = {
    sessionId: randomUUID(),
    appName: identity.appName,
    bundleId: identity.bundleId,
    triggeredBy: "manual",
    regions: filtered,
    userRole: active?.userRole ?? null,
    userGoal: goal,
    startedAt: Date.now(),
    l2Guidance: active?.l2Guidance ?? null,
    windowTitle: host.getWindowTitle(),
    skipIntro: true,
  };

  await runOrientationSession(session, {
    forceIncludeRegionIds: filtered.map((region) => region.id),
  });
  return true;
}

export { isOrientationSessionActive };
