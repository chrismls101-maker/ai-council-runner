/**
 * blackHoleInstaller.ts
 *
 * One-click installer for BlackHole 2ch (virtual audio driver) + IIVO Glass Audio
 * Multi-Output Device (BlackHole + current speakers routed together).
 *
 * Flow:
 *   1. Download the BlackHole 2ch .pkg from GitHub Releases (no password, official source)
 *   2. Install it via `osascript` with `do shell script … with administrator privileges`
 *      (shows exactly one macOS password prompt)
 *   3. Wait for CoreAudio to register the new device (~2 s)
 *   4. Run the bundled `iivo-audio-setup --setup` binary to create the Multi-Output Device
 *
 * Progress is emitted as { status, progress } objects — the caller is responsible for
 * forwarding them to GlassState via IPC dispatch.
 */

import * as https from "node:https";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { app } from "electron";
// Version-pinned URL — bump BLACKHOLE_PKG_VERSION in src/shared/blackholeRelease.ts
// when ExistentialAudio ships a new release.
import { BLACKHOLE_PKG_URL } from "../shared/blackholeRelease.ts";

const execFileAsync = promisify(execFile);

// ─── Config ────────────────────────────────────────────────────────────────────

const BLACKHOLE_PKG_FILENAME = "BlackHole2ch.pkg";

/**
 * Bundle identifier of the iivo-audio-setup binary as installed by electron-builder.
 * At runtime: process.resourcesPath/bin/iivo-audio-setup
 */
function audioHelperPath(): string {
  // In packaged builds, resourcesPath points to the Resources/ directory inside the .app.
  // In dev (electron-vite dev), __dirname is inside out/main/ — walk up to find the binary
  // under resources/bin/ at the repo root.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "bin", "iivo-audio-setup");
  }
  // Dev path: desktop-glass/resources/bin/iivo-audio-setup (built by npm run build:audio-helper)
  return path.join(app.getAppPath(), "..", "..", "resources", "bin", "iivo-audio-setup");
}

// ─── Progress callback type ─────────────────────────────────────────────────

export type BlackHoleInstallStatus =
  | "idle"
  | "downloading"
  | "installing"
  | "configuring"
  | "done"
  | "error";

export interface BlackHoleInstallProgress {
  status: BlackHoleInstallStatus;
  progress: string;
}

export type BlackHoleInstallProgressCallback = (p: BlackHoleInstallProgress) => void;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Download a URL to a local file.  Follows up to 5 redirects.
 */
function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (bytesReceived: number, total: number | null) => void,
  redirectsLeft = 5
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirectsLeft === 0) {
      reject(new Error("Too many redirects"));
      return;
    }
    const file = fs.createWriteStream(destPath);
    https
      .get(url, (res) => {
        if (
          (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) &&
          res.headers.location
        ) {
          file.close();
          fs.unlink(destPath, () => {});
          downloadFile(res.headers.location!, destPath, onProgress, redirectsLeft - 1)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          file.close();
          reject(new Error(`HTTP ${res.statusCode} downloading BlackHole pkg`));
          return;
        }
        const total = res.headers["content-length"]
          ? parseInt(res.headers["content-length"] as string, 10)
          : null;
        let received = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          onProgress?.(received, total);
        });
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      })
      .on("error", (err) => {
        file.close();
        fs.unlink(destPath, () => {});
        reject(err);
      });
  });
}

/**
 * Sleep for `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run the full one-click install.
 *
 * Throws on failure — the caller should catch and dispatch an `error` status.
 */
export async function installBlackHoleAndSetupAudio(
  onProgress: BlackHoleInstallProgressCallback
): Promise<void> {
  const tmpDir = os.tmpdir();
  const pkgPath = path.join(tmpDir, BLACKHOLE_PKG_FILENAME);

  // ── Step 1: Download ──────────────────────────────────────────────────────
  onProgress({ status: "downloading", progress: "Downloading BlackHole 2ch…" });

  await downloadFile(BLACKHOLE_PKG_URL, pkgPath, (received, total) => {
    if (total) {
      const pct = Math.round((received / total) * 100);
      onProgress({ status: "downloading", progress: `Downloading BlackHole 2ch… ${pct}%` });
    }
  });

  onProgress({ status: "downloading", progress: "Download complete." });

  // ── Step 2: Install pkg (requires admin — one password prompt) ────────────
  onProgress({
    status: "installing",
    progress: "Installing BlackHole 2ch — macOS will ask for your password once.",
  });

  // osascript `do shell script` with administrator privileges = one macOS auth dialog.
  // We shell-escape the path in case tmpdir has spaces.
  const escapedPkg = pkgPath.replace(/'/g, "'\\''");
  const installScript = `do shell script "installer -pkg '${escapedPkg}' -target /" with administrator privileges`;

  try {
    await execFileAsync("osascript", ["-e", installScript]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // User may have cancelled the password dialog
    if (msg.includes("User canceled") || msg.includes("-128")) {
      throw new Error("Installation cancelled — password dialog was dismissed.");
    }
    throw new Error(`BlackHole installation failed: ${msg}`);
  }

  // Clean up the downloaded pkg
  fs.unlink(pkgPath, () => {});

  onProgress({ status: "installing", progress: "BlackHole 2ch installed." });

  // ── Step 3: Wait for CoreAudio to register the new device ─────────────────
  onProgress({ status: "configuring", progress: "Waiting for CoreAudio to register BlackHole…" });
  await sleep(2500);

  // ── Step 4: Run iivo-audio-setup --setup ──────────────────────────────────
  onProgress({
    status: "configuring",
    progress: "Setting up IIVO Glass Audio routing…",
  });

  const helperBin = audioHelperPath();

  // Verify the binary exists before attempting to run it
  if (!fs.existsSync(helperBin)) {
    throw new Error(
      `iivo-audio-setup binary not found at: ${helperBin}\n` +
        "Run `npm run build:audio-helper` to build it."
    );
  }

  const { stdout } = await execFileAsync(helperBin, ["--setup"]);
  const lines = stdout.trim().split("\n");
  const lastLine = lines[lines.length - 1] ?? "";

  if (!lastLine.startsWith("ok:")) {
    throw new Error(`Audio routing setup failed: ${lastLine}`);
  }

  onProgress({ status: "done", progress: "System audio is ready. IIVO Glass Audio is active." });
}

/**
 * Tear down the IIVO Glass Audio device and restore original speakers.
 * Non-throwing — logs errors rather than surfacing them to the user.
 */
export async function teardownGlassAudio(
  onProgress?: BlackHoleInstallProgressCallback
): Promise<void> {
  const helperBin = audioHelperPath();
  if (!fs.existsSync(helperBin)) return;

  try {
    const { stdout } = await execFileAsync(helperBin, ["--teardown"]);
    onProgress?.({ status: "idle", progress: stdout.trim() });
  } catch (err) {
    console.error("[blackHoleInstaller] teardown error", err);
  }
}

/**
 * Check whether BlackHole is already installed.
 * Returns true if the iivo-audio-setup binary reports BlackHole present.
 */
export async function isBlackHoleInstalled(): Promise<boolean> {
  const helperBin = audioHelperPath();
  if (!fs.existsSync(helperBin)) return false;
  try {
    await execFileAsync(helperBin, ["--check"]);
    return true;
  } catch {
    return false;
  }
}
