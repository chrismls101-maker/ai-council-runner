/**
 * Check IIVO server (or local manifest) for a newer Glass build and apply updates.
 */

import { app, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GlassConfig } from "../shared/config.ts";
import { iivoApiAuthHeaders } from "../shared/iivoApiAuth.ts";
import {
  defaultGlassUpdateTitle,
  isNewerVersion,
  resolveGlassUpdateDownloadTarget,
  type GlassAppUpdateState,
  type GlassUpdateManifest,
} from "../shared/glassAppUpdate.ts";

let pendingManifest: GlassUpdateManifest | null = null;
let pendingDownloadTarget: string | undefined;

export function getPendingGlassUpdateManifest(): GlassUpdateManifest | null {
  return pendingManifest;
}

async function fetchRemoteManifest(apiUrl: string, signal?: AbortSignal): Promise<GlassUpdateManifest | null> {
  const bases = [
    apiUrl.replace(/\/+$/, ""),
    "http://127.0.0.1:3001",
    "http://localhost:3001",
  ].filter((value, index, all) => all.indexOf(value) === index);

  for (const base of bases) {
    try {
      const res = await fetch(`${base}/api/glass/update`, {
        signal,
        headers: iivoApiAuthHeaders(),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as GlassUpdateManifest & { ok?: boolean; reason?: string };
      if (body.ok === false) continue;
      if (!body.version?.trim()) continue;
      return body;
    } catch {
      /* try next base */
    }
  }
  return null;
}

function readManifestFromPath(filePath: string): GlassUpdateManifest | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as GlassUpdateManifest;
    if (!parsed.version?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readLocalManifestFile(): GlassUpdateManifest | null {
  const fromEnv = process.env.IIVO_GLASS_UPDATE_MANIFEST?.trim();
  const mainDir = path.dirname(fileURLToPath(import.meta.url));
  const bundledManifest = process.resourcesPath
    ? path.join(process.resourcesPath, "glass-update-manifest.json")
    : undefined;

  // Packaged apps must not read dev-repo manifests (would offer downgrades / wrong builds).
  if (app.isPackaged) {
    for (const filePath of [fromEnv, bundledManifest].filter(Boolean) as string[]) {
      const parsed = readManifestFromPath(filePath);
      if (parsed) return parsed;
    }
    return null;
  }

  // Dev: prefer the newest manifest among repo / cwd candidates, then bundled.
  const candidates = [
    fromEnv,
    path.resolve(mainDir, "../../glass-update-manifest.json"),
    path.resolve(process.cwd(), "glass-update-manifest.json"),
    path.resolve(process.cwd(), "desktop-glass/glass-update-manifest.json"),
    path.resolve(app.getAppPath(), "../glass-update-manifest.json"),
    path.resolve(app.getAppPath(), "../../glass-update-manifest.json"),
    path.resolve(app.getPath("home"), "Desktop/ai-council-runner/desktop-glass/glass-update-manifest.json"),
    bundledManifest,
  ].filter(Boolean) as string[];

  let best: GlassUpdateManifest | null = null;
  for (const filePath of candidates) {
    const parsed = readManifestFromPath(filePath);
    if (!parsed) continue;
    if (!best || isNewerVersion(parsed.version, best.version)) {
      best = parsed;
    }
  }
  return best;
}

function existingFile(target: string | undefined): string | undefined {
  if (!target?.trim()) return undefined;
  const trimmed = target.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  let filePath = trimmed.replace(/^file:\/\//i, "");
  if (process.platform === "win32" && /^\/[A-Za-z]:/.test(filePath)) {
    filePath = filePath.slice(1);
  }
  if (fs.existsSync(filePath)) return filePath;
  return undefined;
}

function resolveInstallTarget(manifest: GlassUpdateManifest): string | undefined {
  const primary = resolveGlassUpdateDownloadTarget(manifest, process.platform, process.arch);
  const verified = existingFile(primary);
  if (verified) return verified;

  if (process.platform !== "darwin") return primary;

  const version = manifest.version?.trim();
  const names = version
    ? [
        `IIVO Glass-${version}-arm64.dmg`,
        `IIVO Glass-${version}-universal.dmg`,
        `IIVO Glass-${version}-universal-mac.zip`,
      ]
    : [];

  const searchDirs = [
    path.dirname(existingFile(manifest.darwinArm64Dmg) ?? "") || undefined,
    path.dirname(existingFile(manifest.darwinUniversalDmg) ?? "") || undefined,
    path.resolve(process.cwd(), "desktop-glass/release"),
    path.resolve(process.cwd(), "release"),
    path.resolve(app.getPath("home"), "Desktop/ai-council-runner/desktop-glass/release"),
  ].filter(Boolean) as string[];

  for (const dir of searchDirs) {
    if (!dir || !fs.existsSync(dir)) continue;
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return primary;
}

export async function checkForGlassAppUpdate(
  config: GlassConfig,
  current: GlassAppUpdateState,
): Promise<GlassAppUpdateState> {
  if (process.env.IIVO_GLASS_E2E === "1") {
    return { ...current, phase: "idle", checkedAt: new Date().toISOString() };
  }

  const checking: GlassAppUpdateState = {
    ...current,
    phase: "checking",
    error: undefined,
    checkedAt: new Date().toISOString(),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  let manifest =
    (await fetchRemoteManifest(config.iivoApiUrl, controller.signal)) ??
    readLocalManifestFile();

  clearTimeout(timer);

  pendingManifest = null;
  pendingDownloadTarget = undefined;

  if (!manifest || !isNewerVersion(manifest.version, current.currentVersion)) {
    return {
      ...checking,
      phase: "idle",
      latestVersion: manifest?.version,
      error: manifest ? undefined : "No update manifest found on the IIVO server.",
    };
  }

  const downloadTarget = resolveInstallTarget(manifest);
  pendingManifest = manifest;
  pendingDownloadTarget = downloadTarget;

  return {
    ...checking,
    phase: "available",
    latestVersion: manifest.version,
    buildId: manifest.buildId,
    title: manifest.title ?? defaultGlassUpdateTitle(manifest.version),
    releaseNotes: downloadTarget
      ? manifest.notes
      : `${manifest.notes ?? ""}\n\nInstaller path not found on this Mac — open desktop-glass/release manually.`.trim(),
    downloadUrl: downloadTarget,
  };
}

export async function applyGlassAppUpdate(): Promise<{ ok: true } | { ok: false; error: string }> {
  const manifest = pendingManifest;
  const target =
    pendingDownloadTarget ??
    (manifest ? resolveInstallTarget(manifest) : undefined);

  if (!target) {
    return { ok: false, error: "No update installer path is configured." };
  }

  try {
    if (/^https?:\/\//i.test(target) || /^file:\/\//i.test(target)) {
      await shell.openExternal(target);
    } else if (fs.existsSync(target)) {
      let err = await shell.openPath(target);
      if (err) {
        const fileUrl = `file://${target.split(path.sep).join("/")}`;
        await shell.openExternal(fileUrl);
        err = "";
      }
      if (err) return { ok: false, error: err };
    } else {
      return { ok: false, error: `Update file not found: ${target}` };
    }

    setTimeout(() => {
      app.quit();
    }, 600);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
