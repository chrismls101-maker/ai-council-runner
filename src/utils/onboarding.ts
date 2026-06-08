import type { GlassUserProfile } from "../types/userProfile";
import {
  clearLocalGlassUserProfile,
  saveLocalGlassUserProfile,
  syncGlassUserProfileToServer,
} from "./userProfile";

const ONBOARDING_KEY = "iivo_onboarding_v1_completed";

export function isOnboardingComplete(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "true";
  } catch {
    return false;
  }
}

export function completeOnboarding(profile?: GlassUserProfile): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, "true");
  } catch {
    /* storage unavailable */
  }
  if (profile) {
    saveLocalGlassUserProfile(profile);
    void syncGlassUserProfileToServer(profile).catch(() => {
      /* offline — local copy still available for web council */
    });
  }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(ONBOARDING_KEY);
  } catch {
    /* storage unavailable */
  }
  clearLocalGlassUserProfile();
  void fetch("/api/user-profile", { method: "DELETE" }).catch(() => {
    /* server may be offline */
  });
}
