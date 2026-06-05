#!/usr/bin/env node
/**
 * Open the latest packaged IIVO Glass.app (for macOS permission setup).
 *
 * Usage (repo root):
 *   npm run glass:open:packaged
 *
 * Prerequisite:
 *   npm run glass:package:mac:arm64   # or universal / x64
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RELEASE = path.join(path.resolve(__dirname, ".."), "release");

function findLatestApp() {
  if (!fs.existsSync(RELEASE)) {
    throw new Error(
      "No desktop-glass/release/ folder. Build first:\n  npm run glass:package:mac:arm64",
    );
  }
  const apps = [];
  for (const entry of fs.readdirSync(RELEASE, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("mac")) continue;
    const appPath = path.join(RELEASE, entry.name, "IIVO Glass.app");
    if (fs.existsSync(appPath)) {
      apps.push({ appPath, mtime: fs.statSync(appPath).mtimeMs });
    }
  }
  if (apps.length === 0) {
    throw new Error(
      "No IIVO Glass.app found. Run:\n  npm run glass:package:mac:arm64\n  npm run glass:open:packaged",
    );
  }
  apps.sort((a, b) => b.mtime - a.mtime);
  return apps[0].appPath;
}

const appPath = findLatestApp();
console.log(`Opening ${appPath}`);
execFileSync("open", [appPath], { stdio: "inherit" });
console.log(
  "\nIn the packaged app: trigger Capture, microphone, or System Audio once, then check\n" +
    "System Settings → Privacy & Security. Enable IIVO Glass. Quit and reopen after Screen Recording.\n" +
    "See desktop-glass/GLASS_QA.md § macOS permissions (packaged app).",
);
