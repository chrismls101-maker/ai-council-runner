export interface GlassUserProfile {
  name: string;
  usualWork: string;
  currentFocus: string;
  updatedAt?: string;
}

export const EMPTY_GLASS_USER_PROFILE: GlassUserProfile = {
  name: "",
  usualWork: "",
  currentFocus: "",
};

export function hasGlassUserProfile(profile: GlassUserProfile | null | undefined): boolean {
  if (!profile) return false;
  return [profile.name, profile.usualWork, profile.currentFocus].some((v) => v.trim().length > 0);
}

export function normalizeGlassUserProfile(
  input: Partial<GlassUserProfile> | null | undefined,
): GlassUserProfile | null {
  if (!input) return null;
  const profile: GlassUserProfile = {
    name: String(input.name ?? "").trim(),
    usualWork: String(input.usualWork ?? "").trim(),
    currentFocus: String(input.currentFocus ?? "").trim(),
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : undefined,
  };
  return hasGlassUserProfile(profile) ? profile : null;
}
