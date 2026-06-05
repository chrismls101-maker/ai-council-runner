#!/usr/bin/env node
/**
 * Run IIVO Glass capture permission diagnostics (prints JSON to stdout).
 *
 * Usage (repo root):
 *   npm run glass:diagnose:permissions
 *   npm run glass:diagnose:permissions -- --packaged
 *   npm run glass:diagnose:permissions -- --dev
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GLASS_ROOT = path.resolve(__dirname, "..");
const RELEASE = path.join(GLASS_ROOT, "release");

function findPackagedBinary() {
  if (!fs.existsSync(RELEASE)) {
    throw new Error("No release/ folder. Run: npm run glass:package:mac:arm64");
  }
  const apps = [];
  for (const entry of fs.readdirSync(RELEASE, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("mac")) continue;
    const appPath = path.join(RELEASE, entry.name, "IIVO Glass.app");
    const bin = path.join(appPath, "Contents/MacOS/IIVO Glass");
    if (fs.existsSync(bin)) {
      apps.push({ bin, mtime: fs.statSync(appPath).mtimeMs, appPath });
    }
  }
  if (apps.length === 0) {
    throw new Error("No packaged IIVO Glass.app found under release/mac-*");
  }
  apps.sort((a, b) => b.mtime - a.mtime);
  return apps[0];
}

function findDevElectron() {
  const mainJs = path.join(GLASS_ROOT, "out/main/index.js");
  if (!fs.existsSync(mainJs)) {
    throw new Error("Build required for dev diagnose: npm run glass:build --prefix desktop-glass");
  }
  const electronPkg = path.join(GLASS_ROOT, "node_modules/electron/package.json");
  if (!fs.existsSync(electronPkg)) {
    throw new Error("Install desktop-glass deps: npm run glass:install");
  }
  if (process.platform === "darwin") {
    const electronBin = path.join(
      GLASS_ROOT,
      "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    );
    if (fs.existsSync(electronBin)) return { electronBin };
  }
  const electronBin = path.join(GLASS_ROOT, "node_modules/.bin/electron");
  if (!fs.existsSync(electronBin)) {
    throw new Error("Electron binary not found. Run: npm run glass:install");
  }
  return { electronBin };
}

function main() {
  const usePackaged = process.argv.includes("--packaged");
  const useDev = process.argv.includes("--dev") || !usePackaged;

  const { ELECTRON_RUN_AS_NODE: _stripNodeShim, ...baseEnv } = process.env;
  const env = {
    ...baseEnv,
    IIVO_GLASS_DIAGNOSE: "1",
  };

  let cmd;
  let args;
  let cwd = GLASS_ROOT;

  if (usePackaged && !process.argv.includes("--dev")) {
    const { bin, appPath } = findPackagedBinary();
    console.error(`Diagnosing packaged app: ${appPath}`);
    cmd = bin;
    args = [];
  } else {
    const { electronBin } = findDevElectron();
    console.error(`Diagnosing dev build in ${GLASS_ROOT}`);
    cmd = electronBin;
    args = ["."];
  }

  const result = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.stderr?.trim()) {
    console.error(result.stderr.trim());
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  const stdout = result.stdout?.trim() ?? "";
  const jsonStart = stdout.indexOf("{");
  if (jsonStart >= 0) {
    console.log(stdout.slice(jsonStart));
  } else {
    console.log(stdout);
  }
}

main();
