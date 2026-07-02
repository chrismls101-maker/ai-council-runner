/**
 * Glass Guide — proficiency profiles persisted to userData.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import {
  defaultAppProficiencyProfile,
  parseAppProficiencyProfile,
  regionsToResurface,
  type AppProficiencyProfile,
  type OrientationProficiencyLevel,
} from "../shared/liveOrientationTypes.ts";
import {
  applyRegionActionConfirmed,
  applyRegionPresented,
  applySessionComplete,
} from "../shared/liveOrientationProficiency.ts";
import { buildOrientationProficiencyMemoryFact } from "../shared/liveOrientationMemoryFacts.ts";
import { upsertUserContext } from "./glassMemoryEngine.ts";
import type { OrientationRegion } from "../shared/liveOrientationTypes.ts";

export type OrientationProfilesStore = {
  profiles: Record<string, AppProficiencyProfile>;
};

function profilesFilePath(): string {
  return join(app.getPath("userData"), "live-orientation-profiles.json");
}

export function defaultOrientationProfilesStore(): OrientationProfilesStore {
  return { profiles: {} };
}

export function parseOrientationProfilesStore(raw: unknown): OrientationProfilesStore {
  if (!raw || typeof raw !== "object") return defaultOrientationProfilesStore();
  const obj = raw as { profiles?: unknown };
  if (!obj.profiles || typeof obj.profiles !== "object") {
    return defaultOrientationProfilesStore();
  }
  const profiles: Record<string, AppProficiencyProfile> = {};
  for (const [key, value] of Object.entries(obj.profiles)) {
    const parsed = parseAppProficiencyProfile(value);
    if (parsed) profiles[key] = parsed;
  }
  return { profiles };
}

let cachedStore: OrientationProfilesStore = defaultOrientationProfilesStore();
const regionLabelByBundle = new Map<string, Record<string, string>>();

export function cacheOrientationRegionLabels(
  bundleId: string,
  regions: readonly OrientationRegion[],
): void {
  const labels: Record<string, string> = {};
  for (const region of regions) {
    labels[region.id] = region.label;
  }
  regionLabelByBundle.set(bundleId, labels);
}

function regionLabelsForBundle(bundleId: string): Record<string, string> {
  return regionLabelByBundle.get(bundleId) ?? {};
}

/** Human label for a cached region id, or null when unknown. */
export function getOrientationRegionLabel(bundleId: string, regionId: string): string | null {
  return regionLabelsForBundle(bundleId)[regionId] ?? null;
}

export function syncOrientationFactToMemoryEngine(
  bundleId: string,
  profile: AppProficiencyProfile,
): void {
  const fact = buildOrientationProficiencyMemoryFact(profile, regionLabelsForBundle(bundleId));
  upsertUserContext(fact);
}

export async function loadOrientationProfiles(): Promise<OrientationProfilesStore> {
  try {
    const raw = await fs.readFile(profilesFilePath(), "utf8");
    cachedStore = parseOrientationProfilesStore(JSON.parse(raw));
  } catch {
    cachedStore = defaultOrientationProfilesStore();
  }
  return cachedStore;
}

export async function persistOrientationProfiles(
  store: OrientationProfilesStore = cachedStore,
): Promise<void> {
  cachedStore = store;
  try {
    await fs.writeFile(profilesFilePath(), JSON.stringify(store, null, 2), "utf8");
  } catch {
    // best-effort
  }
}

export function getCachedOrientationProfiles(): OrientationProfilesStore {
  return cachedStore;
}

export function getAppProficiencyProfile(bundleId: string): AppProficiencyProfile | null {
  return cachedStore.profiles[bundleId] ?? null;
}

export function upsertAppProficiencyProfile(
  bundleId: string,
  appName: string,
  patch: Partial<AppProficiencyProfile> = {},
  now = Date.now(),
): AppProficiencyProfile {
  const existing = cachedStore.profiles[bundleId];
  const base = existing ?? defaultAppProficiencyProfile(bundleId, appName, now);
  const next: AppProficiencyProfile = {
    ...base,
    ...patch,
    bundleId,
    appName: appName || base.appName,
    regionConfirmCounts: {
      ...base.regionConfirmCounts,
      ...patch.regionConfirmCounts,
    },
  };
  cachedStore.profiles[bundleId] = next;
  return next;
}

export function recordRegionPresented(
  bundleId: string,
  regionId: string,
  appName: string,
  now = Date.now(),
): AppProficiencyProfile {
  const profile = upsertAppProficiencyProfile(bundleId, appName, {}, now);
  const next = applyRegionPresented(profile, regionId, now);
  const saved = upsertAppProficiencyProfile(bundleId, appName, next, now);
  syncOrientationFactToMemoryEngine(bundleId, saved);
  return saved;
}

export function recordRegionActionConfirmed(
  bundleId: string,
  regionId: string,
  appName: string,
  now = Date.now(),
): { profile: AppProficiencyProfile; level: OrientationProficiencyLevel } {
  const profile = upsertAppProficiencyProfile(bundleId, appName, {}, now);
  const result = applyRegionActionConfirmed(profile, regionId, now);
  const saved = upsertAppProficiencyProfile(bundleId, appName, result.profile, now);
  syncOrientationFactToMemoryEngine(bundleId, saved);
  return { profile: saved, level: result.level };
}

export function recordSessionComplete(
  bundleId: string,
  appName: string,
  presentedRegionIds: string[],
  userGoal: string | null,
  appVersion: string | null,
  now = Date.now(),
): AppProficiencyProfile {
  const profile = upsertAppProficiencyProfile(bundleId, appName, {}, now);
  // applySessionComplete tracks presented-but-never-confirmed regions as
  // neverTouched from the first session — resurfacing is gated on proficiency
  // gaps, not on a session-count runway.
  const next = applySessionComplete(profile, presentedRegionIds, userGoal, appVersion, now);

  const saved = upsertAppProficiencyProfile(bundleId, appName, next, now);
  syncOrientationFactToMemoryEngine(bundleId, saved);
  return saved;
}

export { regionsToResurface };
export type { AppProficiencyProfile };
