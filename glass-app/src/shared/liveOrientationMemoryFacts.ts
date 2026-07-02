/**
 * Glass Guide — proficiency memory fact for glassMemoryEngine (pure).
 */

import type { AppProficiencyProfile } from "./liveOrientationTypes.ts";
import type { ExtractedFact } from "./glassMemory.ts";

export function orientationProficiencyMemoryKey(bundleId: string): string {
  return `glass_guide:${bundleId}`;
}

function regionLabel(regionLabels: Record<string, string>, regionId: string): string {
  return regionLabels[regionId]?.trim() || regionId;
}

export function appProficiencyTier(profile: AppProficiencyProfile): string {
  const masteredCount = profile.masteredRegions.length;
  const knownCount = profile.knownRegions.length;
  if (masteredCount >= 3 && profile.sessionCount >= 3) return "proficient in";
  if (profile.sessionCount >= 2 || knownCount >= 2 || masteredCount >= 1) {
    return "familiar with";
  }
  return "learning";
}

export function buildOrientationProficiencyMemoryFact(
  profile: AppProficiencyProfile,
  regionLabels: Record<string, string>,
): ExtractedFact {
  const tier = appProficiencyTier(profile);

  const mastered = profile.masteredRegions
    .map((id) => regionLabel(regionLabels, id))
    .join(", ") || "none";

  const stillLearning = profile.knownRegions
    .filter((id) => !profile.masteredRegions.includes(id))
    .map((id) => regionLabel(regionLabels, id))
    .join(", ") || "none";

  const neverUsed = profile.neverTouchedRegions
    .map((id) => regionLabel(regionLabels, id))
    .join(", ") || "none";

  const value = [
    `User is ${tier} ${profile.appName}.`,
    `Known areas: ${mastered}.`,
    `Still learning: ${stillLearning}.`,
    `Never used: ${neverUsed}.`,
  ].join(" ");

  return {
    key: orientationProficiencyMemoryKey(profile.bundleId),
    value,
    confidence: 0.85,
  };
}
