/**
 * Persists first-run onboarding completion + profile to Electron userData.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import {
  DEFAULT_GLASS_ONBOARDING_STATE,
  type GlassOnboardingState,
} from "../shared/glassOnboarding.ts";
import { normalizeGlassUserProfile, type GlassUserProfile } from "../shared/glassUserProfile.ts";

function onboardingFilePath(): string {
  return join(app.getPath("userData"), "glass-onboarding.json");
}

export async function loadGlassOnboardingState(): Promise<GlassOnboardingState> {
  try {
    const raw = await fs.readFile(onboardingFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<GlassOnboardingState>;
    return {
      completed: parsed.completed === true,
      profile: normalizeGlassUserProfile(parsed.profile ?? null),
    };
  } catch {
    return { ...DEFAULT_GLASS_ONBOARDING_STATE };
  }
}

export async function persistGlassOnboardingState(state: GlassOnboardingState): Promise<void> {
  try {
    await fs.writeFile(onboardingFilePath(), JSON.stringify(state, null, 2), "utf8");
  } catch {
    // best-effort
  }
}

/** Update profile mid-onboarding without marking the legacy store complete. */
export async function persistGlassUserProfile(
  profile: GlassUserProfile | null,
  completed: boolean,
): Promise<GlassOnboardingState> {
  const next: GlassOnboardingState = {
    completed,
    profile: profile
      ? { ...profile, updatedAt: profile.updatedAt ?? new Date().toISOString() }
      : null,
  };
  await persistGlassOnboardingState(next);
  return next;
}

export async function completeGlassOnboardingStore(
  profile: GlassUserProfile | null,
): Promise<GlassOnboardingState> {
  const next: GlassOnboardingState = {
    completed: true,
    profile: profile
      ? { ...profile, updatedAt: profile.updatedAt ?? new Date().toISOString() }
      : null,
  };
  await persistGlassOnboardingState(next);
  return next;
}
