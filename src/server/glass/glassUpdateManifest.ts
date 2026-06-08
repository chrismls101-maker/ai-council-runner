/**
 * Serve the latest IIVO Glass update manifest to packaged clients.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface GlassUpdateManifestResponse {
  ok: boolean;
  version?: string;
  buildId?: string;
  releasedAt?: string;
  title?: string;
  notes?: string;
  downloadUrl?: string;
  darwinArm64Dmg?: string;
  darwinUniversalDmg?: string;
  reason?: string;
}

function manifestCandidates(): string[] {
  const fromEnv = process.env.GLASS_UPDATE_MANIFEST_PATH?.trim();
  const repoRoot = path.resolve(__dirname, "../../..");
  return [
    fromEnv,
    path.join(repoRoot, "desktop-glass/glass-update-manifest.json"),
    path.join(repoRoot, "glass-update-manifest.json"),
  ].filter(Boolean) as string[];
}

export function loadGlassUpdateManifest(): GlassUpdateManifestResponse {
  for (const filePath of manifestCandidates()) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as GlassUpdateManifestResponse;
      if (!parsed.version?.trim()) continue;
      return { ...parsed, ok: true };
    } catch {
      /* try next */
    }
  }
  return { ok: false, reason: "No glass-update-manifest.json found on server." };
}
