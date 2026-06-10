/**
 * Squirrel.Mac auto-update via electron-updater + GitHub Releases API.
 * Packaged macOS builds only — dev keeps the manifest/DMG fallback in glassAppUpdate.ts.
 */

import { app, shell } from "electron";
import pkg from "electron-updater";
const { autoUpdater } = pkg;
import {
  defaultGlassUpdateTitle,
  type GlassAppUpdateState,
} from "../shared/glassAppUpdate.ts";
import {
  GLASS_GITHUB_UPDATE_OWNER,
  GLASS_GITHUB_UPDATE_REPO,
  glassGitHubReleaseDmgUrl,
} from "../shared/glassAppUpdateFeed.ts";

type StatePatch = Partial<GlassAppUpdateState>;

let pushState: ((patch: StatePatch) => void) | null = null;
let downloadReady = false;
let updateOffered = false;
let offeredVersion: string | undefined;

export function isGlassAutoUpdateEnabled(): boolean {
  if (process.env.IIVO_GLASS_E2E === "1") return false;
  if (process.env.IIVO_GLASS_DISABLE_AUTO_UPDATE === "1") return false;
  if (!app.isPackaged) return false;
  return process.platform === "darwin";
}

function formatReleaseNotes(notes: unknown): string | undefined {
  if (typeof notes === "string") {
    const trimmed = notes.trim();
    return trimmed || undefined;
  }
  if (Array.isArray(notes)) {
    const lines = notes
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object" && "note" in entry) {
          return String((entry as { note?: string }).note ?? "");
        }
        return "";
      })
      .filter(Boolean);
    return lines.length ? lines.join("\n\n") : undefined;
  }
  return undefined;
}

export function initGlassAutoUpdater(
  onPatch: (patch: StatePatch) => void,
  _apiBaseUrl = "https://iivo.ai",
): void {
  if (!isGlassAutoUpdateEnabled()) return;

  pushState = onPatch;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.setFeedURL({
    provider: "github",
    owner: GLASS_GITHUB_UPDATE_OWNER,
    repo: GLASS_GITHUB_UPDATE_REPO,
    releaseType: "release",
  });

  autoUpdater.on("checking-for-update", () => {
    downloadReady = false;
    updateOffered = false;
    onPatch({
      phase: "checking",
      error: undefined,
      downloadPercent: undefined,
      checkedAt: new Date().toISOString(),
    });
  });

  autoUpdater.on("update-available", (info) => {
    downloadReady = false;
    updateOffered = true;
    offeredVersion = info.version;
    onPatch({
      phase: "available",
      latestVersion: info.version,
      title: defaultGlassUpdateTitle(info.version),
      releaseNotes: formatReleaseNotes(info.releaseNotes),
      error: undefined,
      downloadPercent: undefined,
    });
  });

  autoUpdater.on("update-not-available", () => {
    downloadReady = false;
    updateOffered = false;
    onPatch({
      phase: "idle",
      latestVersion: app.getVersion(),
      error: undefined,
      downloadPercent: undefined,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    onPatch({
      phase: "downloading",
      downloadPercent: Math.round(progress.percent),
      error: undefined,
    });
  });

  autoUpdater.on("update-downloaded", () => {
    downloadReady = true;
    onPatch({
      phase: "installing",
      downloadPercent: 100,
      error: undefined,
    });
  });

  autoUpdater.on("error", (_error, message) => {
    const text = message?.trim() || (_error instanceof Error ? _error.message : String(_error));
    if (/code signature|ShipIt|notori/i.test(text) && offeredVersion) {
      void openReleaseDmgFallback(offeredVersion).then((result) => {
        if (result.ok) {
          onPatch({
            phase: "available",
            latestVersion: offeredVersion,
            error:
              "In-app install needs a notarized build. The DMG opened in your browser — drag IIVO Glass to Applications, then reopen.",
          });
          return;
        }
        onPatch({
          phase: updateOffered ? "available" : "idle",
          error: text,
        });
      });
      return;
    }
    onPatch({
      phase: updateOffered ? "available" : "idle",
      error: text,
    });
  });
}

export async function checkGlassAutoUpdate(): Promise<void> {
  if (!isGlassAutoUpdateEnabled()) return;
  pushState?.({
    phase: "checking",
    error: undefined,
    downloadPercent: undefined,
    checkedAt: new Date().toISOString(),
  });
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    pushState?.({
      phase: "idle",
      error: err instanceof Error ? err.message : String(err),
      checkedAt: new Date().toISOString(),
    });
  }
}

async function openReleaseDmgFallback(
  latestVersion?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const version = latestVersion?.trim() || app.getVersion();
  if (!version) {
    return { ok: false, error: "No update version is available for DMG fallback." };
  }
  try {
    await shell.openExternal(glassGitHubReleaseDmgUrl(version));
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function applyGlassAutoUpdate(
  latestVersion?: string,
): Promise<{ ok: true; usedDmgFallback?: boolean } | { ok: false; error: string }> {
  if (!isGlassAutoUpdateEnabled()) {
    return { ok: false, error: "Auto-update is only available in the packaged Mac app." };
  }

  const version = latestVersion?.trim() || offeredVersion?.trim() || app.getVersion();
  // Squirrel/ShipIt requires notarized macOS builds. Open the release DMG until notarized zips ship.
  const dmg = await openReleaseDmgFallback(version);
  if (dmg.ok) {
    return { ok: true, usedDmgFallback: true };
  }
  return dmg;
}
