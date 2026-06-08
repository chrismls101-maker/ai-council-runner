import type { GlassUserProfile } from "../types/userProfile";
import { hasGlassUserProfile } from "../types/userProfile";

export const USER_PROFILE_STORAGE_KEY = "iivo_glass_user_profile_v1";

export function loadLocalGlassUserProfile(): GlassUserProfile | null {
  try {
    const raw = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GlassUserProfile;
    return hasGlassUserProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLocalGlassUserProfile(profile: GlassUserProfile): void {
  try {
    localStorage.setItem(
      USER_PROFILE_STORAGE_KEY,
      JSON.stringify({ ...profile, updatedAt: new Date().toISOString() }),
    );
  } catch {
    /* storage unavailable */
  }
}

export function clearLocalGlassUserProfile(): void {
  try {
    localStorage.removeItem(USER_PROFILE_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export async function syncGlassUserProfileToServer(
  profile: GlassUserProfile,
): Promise<GlassUserProfile | null> {
  if (!hasGlassUserProfile(profile)) return null;
  const res = await fetch("/api/user-profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!res.ok) {
    throw new Error("Could not save profile to server");
  }
  const body = (await res.json()) as { profile: GlassUserProfile | null };
  return body.profile;
}

export async function fetchGlassUserProfileFromServer(): Promise<GlassUserProfile | null> {
  try {
    const res = await fetch("/api/user-profile");
    if (!res.ok) return null;
    const body = (await res.json()) as { profile: GlassUserProfile | null };
    return body.profile;
  } catch {
    return null;
  }
}
