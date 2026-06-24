/**
 * Persists passive context profile to Electron userData (glass-context.json).
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import {
  defaultGlassContextProfile,
  parseGlassContextProfile,
  type GlassContextProfile,
} from "../shared/glassContextEngine.ts";

function glassContextFilePath(): string {
  return join(app.getPath("userData"), "glass-context.json");
}

export async function loadGlassContextProfile(): Promise<GlassContextProfile> {
  try {
    const raw = await fs.readFile(glassContextFilePath(), "utf8");
    return parseGlassContextProfile(JSON.parse(raw));
  } catch {
    return defaultGlassContextProfile();
  }
}

export async function persistGlassContextProfile(profile: GlassContextProfile): Promise<void> {
  try {
    await fs.writeFile(glassContextFilePath(), JSON.stringify(profile, null, 2), "utf8");
  } catch {
    // best-effort local persistence
  }
}
