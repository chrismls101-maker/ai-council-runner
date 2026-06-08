import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { GlassUserProfile } from "./types.js";
import { hasGlassUserProfile } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.resolve(__dirname, "../../../data/user-profile");
const PROFILE_FILE = path.join(PROFILE_DIR, "profile.json");

async function ensureDir(): Promise<void> {
  await fs.mkdir(PROFILE_DIR, { recursive: true });
}

export async function getGlassUserProfile(): Promise<GlassUserProfile | null> {
  await ensureDir();
  try {
    const raw = await fs.readFile(PROFILE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as GlassUserProfile;
    return hasGlassUserProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveGlassUserProfile(
  input: Partial<GlassUserProfile>,
): Promise<GlassUserProfile | null> {
  const profile: GlassUserProfile = {
    name: input.name?.trim() ?? "",
    usualWork: input.usualWork?.trim() ?? "",
    currentFocus: input.currentFocus?.trim() ?? "",
    updatedAt: new Date().toISOString(),
  };
  if (!hasGlassUserProfile(profile)) {
    await clearGlassUserProfile();
    return null;
  }
  await ensureDir();
  await fs.writeFile(PROFILE_FILE, JSON.stringify(profile, null, 2));
  return profile;
}

export async function clearGlassUserProfile(): Promise<void> {
  await ensureDir();
  try {
    await fs.unlink(PROFILE_FILE);
  } catch {
    /* already absent */
  }
}
