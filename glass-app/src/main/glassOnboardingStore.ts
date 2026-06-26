/**
 * Persists first-run onboarding completion + profile to Electron userData.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import {
  DEFAULT_GLASS_ONBOARDING_STATE,
  parseOnboardingJson,
  type GlassOnboardingState,
} from "../shared/glassOnboarding.ts";
import { type GlassUserProfile } from "../shared/glassUserProfile.ts";

function onboardingFilePath(): string {
  return join(app.getPath("userData"), "glass-onboarding.json");
}

export async function loadGlassOnboardingState(): Promise<GlassOnboardingState> {
  try {
    const raw = await fs.readFile(onboardingFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<GlassOnboardingState>;
    // Consent fields — default false; must be explicitly set during onboarding.
    // On existing installs (no field present) we stay false — safe default.
    return parseOnboardingJson(parsed);
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
  // Load existing state so consent fields are not lost on profile update.
  const existing = await loadGlassOnboardingState();
  const next: GlassOnboardingState = {
    ...existing,
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
  // Load existing state so consent fields are not lost on completion.
  const existing = await loadGlassOnboardingState();
  const next: GlassOnboardingState = {
    ...existing,
    completed: true,
    profile: profile
      ? { ...profile, updatedAt: profile.updatedAt ?? new Date().toISOString() }
      : null,
  };
  await persistGlassOnboardingState(next);
  return next;
}

/**
 * Persist one or more consent flags without touching profile or completion.
 * Called from onboarding flow when user checks/unchecks consent boxes.
 */
export async function persistConsentFlags(
  flags: Partial<Pick<
    GlassOnboardingState,
    "consentMicAck" | "consentScreenAck" | "consentRecordingAck" | "consentTosAck"
  >>
): Promise<GlassOnboardingState> {
  const existing = await loadGlassOnboardingState();
  const next: GlassOnboardingState = { ...existing, ...flags };
  await persistGlassOnboardingState(next);
  return next;
}
