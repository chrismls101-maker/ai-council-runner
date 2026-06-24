/**
 * IIVO Glass in-app update manifest + semver helpers (dependency-free).
 */

export interface GlassUpdateManifest {
  version: string;
  buildId?: string;
  releasedAt?: string;
  title?: string;
  notes?: string;
  downloadUrl?: string;
  darwinArm64Dmg?: string;
  darwinUniversalDmg?: string;
}

export type GlassAppUpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "dismissed";

export interface GlassAppUpdateState {
  phase: GlassAppUpdatePhase;
  currentVersion: string;
  latestVersion?: string;
  buildId?: string;
  title?: string;
  releaseNotes?: string;
  downloadUrl?: string;
  downloadPercent?: number;
  checkedAt?: string;
  error?: string;
}

export function emptyGlassAppUpdateState(currentVersion: string): GlassAppUpdateState {
  return { phase: "idle", currentVersion };
}

/** Parse "0.1.0" into comparable numeric tuple. */
export function parseSemver(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map((part) => {
      const n = Number.parseInt(part.replace(/[^0-9].*$/, ""), 10);
      return Number.isFinite(n) ? n : 0;
    });
}

export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}

export function resolveGlassUpdateDownloadTarget(
  manifest: GlassUpdateManifest,
  platform: NodeJS.Platform,
  arch: string,
): string | undefined {
  if (manifest.downloadUrl?.trim()) return manifest.downloadUrl.trim();
  if (platform !== "darwin") return undefined;
  if (arch === "arm64" && manifest.darwinArm64Dmg?.trim()) return manifest.darwinArm64Dmg.trim();
  if (manifest.darwinUniversalDmg?.trim()) return manifest.darwinUniversalDmg.trim();
  if (manifest.darwinArm64Dmg?.trim()) return manifest.darwinArm64Dmg.trim();
  return undefined;
}

export function defaultGlassUpdateTitle(latestVersion: string): string {
  return `NEW SYSTEM UPDATE · v${latestVersion}`;
}
