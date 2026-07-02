/**
 * Pure proficiency transitions (no Electron — testable in Node).
 */

import {
  ORIENTATION_MASTERY_CONFIRMATIONS,
  defaultAppProficiencyProfile,
  proficiencyLevelForRegion,
  type AppProficiencyProfile,
  type OrientationProficiencyLevel,
} from "./liveOrientationTypes.ts";

export function applyRegionPresented(
  profile: AppProficiencyProfile,
  regionId: string,
  now = Date.now(),
): AppProficiencyProfile {
  // Presentation never suppresses a region — only a confirmed interaction
  // (applyRegionActionConfirmed) advances it to "familiar"/knownRegions.
  const presented = profile.presentedRegions ?? [];
  const presentedRegions = presented.includes(regionId)
    ? presented
    : [...presented, regionId];
  const neverTouchedRegions =
    profile.knownRegions.includes(regionId) || profile.neverTouchedRegions.includes(regionId)
      ? profile.neverTouchedRegions
      : [...profile.neverTouchedRegions, regionId];
  return {
    ...profile,
    presentedRegions,
    neverTouchedRegions,
    lastSeen: now,
  };
}

export function applyRegionActionConfirmed(
  profile: AppProficiencyProfile,
  regionId: string,
  now = Date.now(),
): { profile: AppProficiencyProfile; level: OrientationProficiencyLevel } {
  const counts = { ...profile.regionConfirmCounts };
  const nextCount = (counts[regionId] ?? 0) + 1;
  counts[regionId] = nextCount;

  const knownRegions = profile.knownRegions.includes(regionId)
    ? profile.knownRegions
    : [...profile.knownRegions, regionId];

  let masteredRegions = profile.masteredRegions;
  if (nextCount >= ORIENTATION_MASTERY_CONFIRMATIONS && !masteredRegions.includes(regionId)) {
    masteredRegions = [...masteredRegions, regionId];
  }

  const presented = profile.presentedRegions ?? [];
  const updated: AppProficiencyProfile = {
    ...profile,
    knownRegions,
    masteredRegions,
    regionConfirmCounts: counts,
    presentedRegions: presented.includes(regionId) ? presented : [...presented, regionId],
    neverTouchedRegions: profile.neverTouchedRegions.filter((id) => id !== regionId),
    lastSeen: now,
  };

  return {
    profile: updated,
    level: proficiencyLevelForRegion(updated, regionId),
  };
}

export function applySessionComplete(
  profile: AppProficiencyProfile,
  presentedRegionIds: string[],
  userGoal: string | null,
  appVersion: string | null,
  now = Date.now(),
): AppProficiencyProfile {
  // Presented regions are recorded as presented — NOT as known/familiar.
  const presentedRegions = [
    ...new Set([...(profile.presentedRegions ?? []), ...presentedRegionIds]),
  ];
  const neverTouchedRegions = [
    ...new Set([
      ...profile.neverTouchedRegions,
      ...presentedRegionIds.filter((id) => !profile.knownRegions.includes(id)),
    ]),
  ];
  const sessionCount = profile.sessionCount + 1;
  const goalHistory = userGoal && !profile.goalHistory.includes(userGoal)
    ? [...profile.goalHistory.slice(-19), userGoal]
    : profile.goalHistory;

  return {
    ...profile,
    lastSeen: now,
    sessionCount,
    presentedRegions,
    neverTouchedRegions,
    goalHistory,
    lastAppVersion: appVersion ?? profile.lastAppVersion,
  };
}

export { defaultAppProficiencyProfile };
