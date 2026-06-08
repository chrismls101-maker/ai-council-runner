import type { GlassUserProfile } from "./types.js";
import { hasGlassUserProfile } from "./types.js";

export function normalizeGlassUserProfile(
  input: Partial<GlassUserProfile> | undefined,
): GlassUserProfile | undefined {
  if (!input) return undefined;
  const profile: GlassUserProfile = {
    name: input.name?.trim() ?? "",
    usualWork: input.usualWork?.trim() ?? "",
    currentFocus: input.currentFocus?.trim() ?? "",
    updatedAt: input.updatedAt,
  };
  return hasGlassUserProfile(profile) ? profile : undefined;
}

export function formatGlassUserProfileBlock(profile: GlassUserProfile): string {
  const lines = ["User Profile (from Glass calibration):"];
  if (profile.name.trim()) lines.push(`Name: ${profile.name.trim()}`);
  if (profile.usualWork.trim()) lines.push(`Kind of work: ${profile.usualWork.trim()}`);
  if (profile.currentFocus.trim()) {
    lines.push(`Current focus: ${profile.currentFocus.trim()}`);
  }
  lines.push(
    "Use this to personalize tone and examples. Do not assume a single job title or industry beyond what they wrote.",
  );
  return lines.join("\n");
}
