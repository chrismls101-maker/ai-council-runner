export interface GlassUserProfile {
  name: string;
  usualWork: string;
  currentFocus: string;
  updatedAt?: string;
}

export function hasGlassUserProfile(profile: GlassUserProfile | null | undefined): boolean {
  if (!profile) return false;
  return [profile.name, profile.usualWork, profile.currentFocus].some((v) => v.trim().length > 0);
}
