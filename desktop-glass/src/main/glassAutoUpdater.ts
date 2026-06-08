/**
 * Squirrel.Mac auto-update via electron-updater + GitHub Releases API.
 * Packaged macOS builds only — dev keeps the manifest/DMG fallback in glassAppUpdate.ts.
 */

import { app } from "electron";
import pkg from "electron-updater";
const { autoUpdater } = pkg;
import {
  defaultGlassUpdateTitle,
  type GlassAppUpdateState,
} from "../shared/glassAppUpdate.ts";

type StatePatch = Partial<GlassAppUpdateState>;

let pushState: ((patch: StatePatch) => void) | null = null;
let downloadReady = false;
let updateOffered = false;

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
  apiBaseUrl = "https://iivo.ai",
): void {
  if (!isGlassAutoUpdateEnabled()) return;

  pushState = onPatch;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.allowPrerelease = false;

  const feedBase = `${apiBaseUrl.replace(/\/+$/, "")}/api/glass/update/electron`;
  autoUpdater.setFeedURL({
    provider: "generic",
    url: feedBase,
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

export async function applyGlassAutoUpdate(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isGlassAutoUpdateEnabled()) {
    return { ok: false, error: "Auto-update is only available in the packaged Mac app." };
  }

  try {
    if (downloadReady) {
      autoUpdater.quitAndInstall(false, true);
      return { ok: true };
    }

    pushState?.({ phase: "downloading", error: undefined, downloadPercent: 0 });
    await autoUpdater.downloadUpdate();
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
