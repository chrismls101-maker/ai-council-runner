/**
 * Glass Guide — Live Orientation Layer types and pure helpers.
 */

import type { AletheiaGhostCursorPhase } from "./aletheiaGhostCursor.ts";

export type OrientationRegionRole =
  | "navigation"
  | "action"
  | "content"
  | "settings"
  | "status";

export interface OrientationFractionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OrientationRegion {
  id: string;
  label: string;
  bounds: OrientationFractionBounds;
  priority: number;
  role: OrientationRegionRole;
  l1: string;
  l2: string | null;
  l3: string | null;
  l4: OrientationAction[];
}

export interface OrientationAction {
  label: string;
  op: OrientationActionOp;
  payload?: unknown;
}

export type OrientationActionOp =
  | "navigate_to"
  | "demonstrate"
  | "skip"
  | "open_in_glass";

export interface AppProficiencyProfile {
  bundleId: string;
  appName: string;
  firstSeen: number;
  lastSeen: number;
  sessionCount: number;
  /**
   * Regions the user has actually interacted with (confirmed action) —
   * "familiar". Only these are suppressed from future orientation.
   * Being shown a region once never lands here.
   */
  knownRegions: string[];
  masteredRegions: string[];
  /** Regions presented at least once but never interacted with. */
  neverTouchedRegions: string[];
  /** Regions shown to the user (talked about), regardless of interaction. */
  presentedRegions?: string[];
  lastAppVersion: string | null;
  inferredUserRole: string | null;
  goalHistory: string[];
  /** Region id → confirmation count toward mastery. */
  regionConfirmCounts?: Record<string, number>;
}

export type OrientationTriggerReason =
  | "new_app"
  | "long_absence"
  | "version_change"
  | "manual"
  | "stuck"
  | "early_sessions";

export interface OrientationSession {
  sessionId: string;
  appName: string;
  bundleId: string;
  triggeredBy: OrientationTriggerReason;
  regions: OrientationRegion[];
  userRole: string | null;
  userGoal: string | null;
  startedAt: number;
  l2Guidance?: string | null;
  partialReorient?: boolean;
  appVersion?: string | null;
  /** Browser tab title or window title at session start. */
  windowTitle?: string | null;
  /** Skip the spoken tour intro (e.g. goal replan). */
  skipIntro?: boolean;
}

export type OrientationProficiencyLevel =
  | "unseen"
  | "presented"
  | "familiar"
  | "mastered";

export interface OrientationGhostCursorState {
  x: number;
  y: number;
  phase: AletheiaGhostCursorPhase;
  /** Glide start (user's actual cursor) — the ghost travels, it never teleports. */
  fromX?: number;
  fromY?: number;
  /** Glide duration (600–900ms by distance). Omitted = no glide. */
  glideMs?: number;
}

export interface OrientationShowRegionPayload {
  sessionId: string;
  region: OrientationRegion;
  index: number;
  total: number;
  l2Banner?: string | null;
  mode?: "region" | "l2_final";
  /** Every third region goes voice+ring only — no label card. */
  hideCard?: boolean;
}

export interface OrientationSessionStatePayload {
  paused: boolean;
  currentIndex: number;
}

export interface OrientationStuckPromptPayload {
  regionLabel: string;
  regionId: string;
  sessionId?: string;
  /**
   * "glance" = colleague-glance stance: ghost cursor appears with the user,
   * one quiet spoken line, dissolves on any movement. No buttons.
   */
  mode?: "prompt" | "glance";
  /** Spoken line for glance mode (also shown as caption). */
  line?: string;
}

/** Session opt-in pill — replaces auto-started tours. */
export interface OrientationOfferPayload {
  offerId: string;
  appName: string;
  /** Saved goal from a previous session, offered as "Continue: …". */
  continueGoal?: string | null;
  /** Never-touched region offered as a quiet 20-second look. */
  resurfaceRegionLabel?: string | null;
  /** Session-start note for quiet sessions ("You've got most of this now…"). */
  note?: string | null;
  /** Auto-dissolve after this many ms with no interaction. */
  timeoutMs: number;
}

/** Single-fetch TTS playback payload — audio decoded and played in the overlay. */
export interface OrientationSpeakPayload {
  nonce: number;
  text: string;
  /** Base64 MP3; null when no TTS is available (silent, caption only). */
  audioBase64: string | null;
}

/**
 * How much presence Glass brings to a session — sessions get quieter as the
 * user accrues proficiency in the app.
 */
export type OrientationSessionStyle = {
  voice: "full" | "one_line" | "none";
  ghost: "full" | "navigate_only" | "none";
  labelCards: boolean;
  /** Cap on regions presented this session (Infinity = no cap). */
  maxRegions: number;
  /** Quiet note at session start naming the silence. */
  startNote: string | null;
};

export function orientationSessionStyle(sessionCount: number): OrientationSessionStyle {
  if (sessionCount <= 0) {
    return { voice: "full", ghost: "full", labelCards: true, maxRegions: Infinity, startNote: null };
  }
  if (sessionCount === 1) {
    return { voice: "one_line", ghost: "navigate_only", labelCards: true, maxRegions: Infinity, startNote: null };
  }
  if (sessionCount === 2) {
    return { voice: "none", ghost: "none", labelCards: true, maxRegions: 2, startNote: null };
  }
  return {
    voice: "none",
    ghost: "none",
    labelCards: false,
    maxRegions: 0,
    startNote: "You've got most of this now. I'll stay quiet unless you're stuck.",
  };
}

export interface OrientationActionPayload {
  sessionId: string;
  regionId: string;
  op: OrientationActionOp;
}

export type OrientationSkipKind = "region" | "all" | "pause" | "resume";

export interface OrientationSkipPayload {
  kind: OrientationSkipKind;
  sessionId?: string;
}

export interface ScreenPixelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ORIENTATION_LONG_ABSENCE_MS = 30 * 24 * 60 * 60 * 1000;
export const ORIENTATION_EARLY_SESSION_THRESHOLD = 3;
export const ORIENTATION_APP_FOCUS_MIN_MS = 8_000;
export const ORIENTATION_MASTERY_CONFIRMATIONS = 3;
/**
 * Resurfacing is driven by proficiency gaps (neverTouchedRegions), not a long
 * session-count runway — after two sessions Glass may quietly offer regions
 * the user has never touched.
 */
export const ORIENTATION_UNSEEN_RESURFACE_SESSIONS = 2;

export const DEFAULT_ORIENTATION_PRIVACY_APPS = [
  "1Password",
  "Bitwarden",
  "LastPass",
  "Dashlane",
  "KeePassXC",
  "Keychain Access",
  "Bank of America",
  "Chase",
  "Wells Fargo",
  "Citibank",
  "Capital One",
  "American Express",
  "Venmo",
  "PayPal",
  "Robinhood",
  "Coinbase",
] as const;

const GLASS_APP_PATTERN = /^(Native Glass|Electron|IIVO|iivo|glass)/i;

export function isGlassOrientationApp(appName: string | null | undefined): boolean {
  if (!appName?.trim()) return false;
  return GLASS_APP_PATTERN.test(appName.trim());
}

export function isOrientationPrivacyApp(
  appName: string | null | undefined,
  privacyApps: readonly string[],
): boolean {
  if (!appName?.trim()) return false;
  const lower = appName.trim().toLowerCase();
  return privacyApps.some((entry) => lower.includes(entry.toLowerCase()));
}

export function fractionBoundsToScreenPx(
  bounds: OrientationFractionBounds,
  display: DisplayBounds,
): ScreenPixelBounds {
  return {
    x: display.x + bounds.x * display.width,
    y: display.y + bounds.y * display.height,
    width: bounds.width * display.width,
    height: bounds.height * display.height,
  };
}

export function regionCenterScreenPx(
  region: OrientationRegion,
  display: DisplayBounds,
): { x: number; y: number } {
  const px = fractionBoundsToScreenPx(region.bounds, display);
  return {
    x: px.x + px.width / 2,
    y: px.y + px.height / 2,
  };
}

export function deriveOrientationActions(role: OrientationRegionRole): OrientationAction[] {
  switch (role) {
    case "navigation":
      return [{ label: "Take me there", op: "navigate_to" }];
    case "action":
      return [{ label: "Show me how", op: "demonstrate" }];
    case "content":
      return [{ label: "Explain more", op: "open_in_glass" }];
    case "settings":
      return [{ label: "Skip for now", op: "skip" }];
    case "status":
      return [{ label: "Skip for now", op: "skip" }];
    default:
      return [{ label: "Skip for now", op: "skip" }];
  }
}

export function enrichOrientationRegion(raw: Partial<OrientationRegion>): OrientationRegion | null {
  if (!raw.id?.trim() || !raw.label?.trim() || !raw.l1?.trim()) return null;
  const bounds = normalizeFractionBounds(raw.bounds);
  if (!bounds) return null;
  const role = parseOrientationRegionRole(raw.role);
  return {
    id: raw.id.trim(),
    label: raw.label.trim(),
    bounds,
    priority: typeof raw.priority === "number" && Number.isFinite(raw.priority)
      ? raw.priority
      : 99,
    role,
    l1: raw.l1.trim(),
    l2: typeof raw.l2 === "string" ? raw.l2.trim() || null : null,
    l3: typeof raw.l3 === "string" ? raw.l3.trim() || null : null,
    l4: Array.isArray(raw.l4) && raw.l4.length > 0
      ? raw.l4
      : deriveOrientationActions(role),
  };
}

function normalizeFractionBounds(
  bounds: Partial<OrientationFractionBounds> | undefined,
): OrientationFractionBounds | null {
  if (!bounds) return null;
  const x = clamp01(bounds.x);
  const y = clamp01(bounds.y);
  const width = clamp01(bounds.width);
  const height = clamp01(bounds.height);
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function clamp01(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function parseOrientationRegionRole(value: unknown): OrientationRegionRole {
  if (
    value === "navigation"
    || value === "action"
    || value === "content"
    || value === "settings"
    || value === "status"
  ) {
    return value;
  }
  return "content";
}

export function parseOrientationRegionsJson(raw: unknown): OrientationRegion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => enrichOrientationRegion(entry as Partial<OrientationRegion>))
    .filter((r): r is OrientationRegion => r != null)
    .sort((a, b) => a.priority - b.priority);
}

export function parseOrientationL2Json(raw: unknown): { found: boolean; guidance: string | null } {
  if (!raw || typeof raw !== "object") return { found: false, guidance: null };
  const obj = raw as { found?: unknown; guidance?: unknown };
  if (obj.found !== true) return { found: false, guidance: null };
  const guidance = typeof obj.guidance === "string" ? obj.guidance.trim() : "";
  return { found: Boolean(guidance), guidance: guidance || null };
}

export interface OrientationL3Adaptation {
  regionId: string;
  priority?: number;
  l3Note?: string | null;
}

export function parseOrientationL3Json(raw: unknown): OrientationL3Adaptation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): OrientationL3Adaptation | null => {
      if (!entry || typeof entry !== "object") return null;
      const obj = entry as { regionId?: unknown; priority?: unknown; l3Note?: unknown };
      if (typeof obj.regionId !== "string" || !obj.regionId.trim()) return null;
      return {
        regionId: obj.regionId.trim(),
        priority: typeof obj.priority === "number" ? obj.priority : undefined,
        l3Note: typeof obj.l3Note === "string" ? obj.l3Note.trim() || null : undefined,
      };
    })
    .filter((r): r is OrientationL3Adaptation => r != null);
}

export function applyL3Adaptations(
  regions: OrientationRegion[],
  adaptations: OrientationL3Adaptation[],
): OrientationRegion[] {
  if (adaptations.length === 0) return regions;
  const byId = new Map(adaptations.map((a) => [a.regionId, a]));
  const next = regions.map((region) => {
    const adapt = byId.get(region.id);
    if (!adapt) return region;
    return {
      ...region,
      priority: adapt.priority ?? region.priority,
      l3: adapt.l3Note ?? region.l3,
    };
  });
  return [...next].sort((a, b) => a.priority - b.priority);
}

export function parseOrientationGoalSelectionJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.trim());
}

export function applyGoalRegionSelection(
  regions: OrientationRegion[],
  selectedIds: readonly string[],
): OrientationRegion[] {
  if (selectedIds.length === 0) return regions;
  const byId = new Map(regions.map((region) => [region.id, region]));
  const picked = selectedIds
    .map((id) => byId.get(id))
    .filter((region): region is OrientationRegion => region != null);
  return picked.length > 0 ? picked : regions;
}

export function filterRegionsForSession(
  regions: OrientationRegion[],
  profile: AppProficiencyProfile | null,
  opts?: {
    partialReorient?: boolean;
    onlyRegionId?: string;
    forceIncludeRegionIds?: readonly string[];
  },
): OrientationRegion[] {
  const forceInclude = new Set(opts?.forceIncludeRegionIds ?? []);
  let filtered = regions;
  if (opts?.onlyRegionId) {
    filtered = filtered.filter((r) => r.id === opts.onlyRegionId);
  } else if (profile) {
    filtered = filtered.filter(
      (r) => !profile.masteredRegions.includes(r.id) || forceInclude.has(r.id),
    );
    if (opts?.partialReorient) {
      filtered = filtered.filter(
        (r) =>
          forceInclude.has(r.id)
          || !profile.knownRegions.includes(r.id)
          || profile.neverTouchedRegions.includes(r.id),
      );
    }
  }
  return filtered;
}

export function shouldTriggerOrientation(input: {
  profile: AppProficiencyProfile | null;
  now: number;
  currentVersion: string | null;
  manual?: boolean;
  stuck?: boolean;
}): { trigger: boolean; reason: OrientationTriggerReason | null } {
  if (input.manual) return { trigger: true, reason: "manual" };
  if (input.stuck) return { trigger: true, reason: "stuck" };
  if (!input.profile) return { trigger: true, reason: "new_app" };
  if (input.now - input.profile.lastSeen > ORIENTATION_LONG_ABSENCE_MS) {
    return { trigger: true, reason: "long_absence" };
  }
  if (input.profile.sessionCount < ORIENTATION_EARLY_SESSION_THRESHOLD) {
    return { trigger: true, reason: "early_sessions" };
  }
  if (
    input.currentVersion
    && input.profile.lastAppVersion
    && input.currentVersion !== input.profile.lastAppVersion
  ) {
    return { trigger: true, reason: "version_change" };
  }
  return { trigger: false, reason: null };
}

export function regionsToResurface(profile: AppProficiencyProfile): string[] {
  if (profile.sessionCount < ORIENTATION_UNSEEN_RESURFACE_SESSIONS) return [];
  return profile.neverTouchedRegions.filter(
    (id) => !profile.masteredRegions.includes(id) && !profile.knownRegions.includes(id),
  );
}

export function defaultAppProficiencyProfile(
  bundleId: string,
  appName: string,
  now = Date.now(),
): AppProficiencyProfile {
  return {
    bundleId,
    appName,
    firstSeen: now,
    lastSeen: now,
    sessionCount: 0,
    knownRegions: [],
    masteredRegions: [],
    neverTouchedRegions: [],
    presentedRegions: [],
    lastAppVersion: null,
    inferredUserRole: null,
    goalHistory: [],
    regionConfirmCounts: {},
  };
}

export function parseAppProficiencyProfile(raw: unknown): AppProficiencyProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Partial<AppProficiencyProfile>;
  if (typeof obj.bundleId !== "string" || !obj.bundleId.trim()) return null;
  if (typeof obj.appName !== "string" || !obj.appName.trim()) return null;
  return {
    bundleId: obj.bundleId.trim(),
    appName: obj.appName.trim(),
    firstSeen: typeof obj.firstSeen === "number" ? obj.firstSeen : Date.now(),
    lastSeen: typeof obj.lastSeen === "number" ? obj.lastSeen : Date.now(),
    sessionCount: typeof obj.sessionCount === "number" ? obj.sessionCount : 0,
    knownRegions: Array.isArray(obj.knownRegions) ? obj.knownRegions.filter((s) => typeof s === "string") : [],
    masteredRegions: Array.isArray(obj.masteredRegions) ? obj.masteredRegions.filter((s) => typeof s === "string") : [],
    neverTouchedRegions: Array.isArray(obj.neverTouchedRegions) ? obj.neverTouchedRegions.filter((s) => typeof s === "string") : [],
    presentedRegions: Array.isArray(obj.presentedRegions) ? obj.presentedRegions.filter((s) => typeof s === "string") : [],
    lastAppVersion: typeof obj.lastAppVersion === "string" ? obj.lastAppVersion : null,
    inferredUserRole: typeof obj.inferredUserRole === "string" ? obj.inferredUserRole : null,
    goalHistory: Array.isArray(obj.goalHistory) ? obj.goalHistory.filter((s) => typeof s === "string") : [],
    regionConfirmCounts: obj.regionConfirmCounts && typeof obj.regionConfirmCounts === "object"
      ? { ...obj.regionConfirmCounts }
      : {},
  };
}

export function proficiencyLevelForRegion(
  profile: AppProficiencyProfile | null,
  regionId: string,
): OrientationProficiencyLevel {
  if (!profile) return "unseen";
  if (profile.masteredRegions.includes(regionId)) return "mastered";
  // knownRegions = confirmed interaction → familiar. A region stays merely
  // "presented" (and keeps resurfacing) until the user actually uses it.
  if (profile.knownRegions.includes(regionId)) return "familiar";
  if (profile.presentedRegions?.includes(regionId)) return "presented";
  return "unseen";
}

/** Human-readable place name for orientation intro speech. */
export function formatOrientationPlace(
  appName: string,
  windowTitle?: string | null,
): string {
  const title = windowTitle?.trim();
  if (!title) return appName;
  const browser = /chrome|safari|firefox|edge|arc|brave/i.test(appName);
  if (browser) {
    const page = title
      .replace(/\s*[-–—|]\s*(Google Chrome|Chrome|Safari|Firefox|Microsoft Edge|Arc|Brave).*$/i, "")
      .trim();
    if (page && page.length > 0) return page;
  }
  return `${title} in ${appName}`;
}

/** Spoken once when a guided tour begins. */
export function buildOrientationSessionIntro(
  appName: string,
  windowTitle: string | null | undefined,
  isFirstVisit: boolean,
): string {
  const place = formatOrientationPlace(appName, windowTitle);
  if (isFirstVisit) {
    return `You're viewing ${place}. I can see what's on screen — I'll point out the important spots. Tell me what you're trying to do, or press Space when you're ready for the next one.`;
  }
  return `Quick refresher on ${place}. I'll point things out — press Space when you're ready to move on.`;
}

/** Spoken when the user states a goal mid-session. */
export function buildOrientationGoalAck(goal: string, place: string): string {
  const cleaned = goal.trim().replace(/\.$/, "");
  return `Got it — ${cleaned}. I'll show you the right spots in ${place}.`;
}
