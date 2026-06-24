/**
 * Onboarding boot flags (no Electron imports — testable in Node).
 */

import type { GlassUserSettings } from "../shared/glassSettings.ts";
import {
  loadGlassOnboardingState,
} from "./glassOnboardingStore.ts";
import {
  loadGlassUserSettings,
  persistGlassUserSettings,
} from "./glassSettingsPersistence.ts";

/** First-run = Sorting Hat onboarding not yet completed (glass-settings.json). */
export function isFirstRun(settings: GlassUserSettings): boolean {
  return !settings.onboardingComplete;
}

export async function markOnboardingComplete(
  settings: GlassUserSettings,
): Promise<GlassUserSettings> {
  const next = { ...settings, onboardingComplete: true };
  await persistGlassUserSettings(next);
  return next;
}

export interface BootOnboardingPrepareResult {
  glassUserSettings: GlassUserSettings;
  glassOnboardingState: Awaited<ReturnType<typeof loadGlassOnboardingState>>;
  needsSortingHat: boolean;
  e2eFastOnboarding: boolean;
}

/** Load settings + legacy onboarding migration. */
export async function prepareBootOnboarding(
  options: { e2e?: boolean } = {},
): Promise<BootOnboardingPrepareResult> {
  let glassUserSettings = await loadGlassUserSettings();
  let glassOnboardingState = await loadGlassOnboardingState();
  const e2e = options.e2e === true;

  if (e2e) {
    glassOnboardingState = { ...glassOnboardingState, completed: true };
    glassUserSettings = { ...glassUserSettings, onboardingComplete: true };
  }

  if (glassOnboardingState.completed && !glassUserSettings.onboardingComplete) {
    glassUserSettings = await markOnboardingComplete(glassUserSettings);
  }

  return {
    glassUserSettings,
    glassOnboardingState,
    needsSortingHat: isFirstRun(glassUserSettings),
    e2eFastOnboarding: e2e,
  };
}
