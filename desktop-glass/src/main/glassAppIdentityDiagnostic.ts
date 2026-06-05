/**
 * Collect runtime app identity for capture permission diagnostics (main process).
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { GLASS_BUNDLE_ID, glassPrivacySettingsAppLabel } from "../shared/glassAppIdentity.ts";
import {
  detectGlassPackagingVariant,
  formatPackagingVariantLabel,
} from "../shared/glassPackagingVariant.ts";
import type {
  DuplicateGlassAppBundle,
  GlassAppIdentityReport,
} from "../shared/glassAppIdentityReport.ts";
import { evaluatePackagedIdentity } from "../shared/glassAppIdentityReport.ts";

function macOSAppBundlePath(execPath: string): string | undefined {
  if (process.platform !== "darwin") return undefined;
  const marker = ".app/Contents/MacOS/";
  const idx = execPath.indexOf(marker);
  if (idx < 0) return undefined;
  return execPath.slice(0, idx + 4);
}

function readBundleIdentifier(bundlePath: string): string | undefined {
  const plist = path.join(bundlePath, "Contents/Info.plist");
  if (!fs.existsSync(plist)) return undefined;
  try {
    return execFileSync(
      "/usr/libexec/PlistBuddy",
      ["-c", "Print :CFBundleIdentifier", plist],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return undefined;
  }
}

export function findDuplicateGlassAppBundles(execPath: string): DuplicateGlassAppBundle[] {
  const found = new Map<string, DuplicateGlassAppBundle>();
  const add = (appPath: string) => {
    if (!appPath.endsWith("IIVO Glass.app") || !fs.existsSync(appPath)) return;
    const stat = fs.statSync(appPath);
    found.set(appPath, {
      path: appPath,
      bundleIdentifier: readBundleIdentifier(appPath),
      modifiedAt: stat.mtime.toISOString(),
    });
  };

  const runningBundle = macOSAppBundlePath(execPath);
  if (runningBundle) add(runningBundle);

  const releaseDir = path.resolve(process.cwd(), "release");
  if (fs.existsSync(releaseDir)) {
    for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("mac")) continue;
      add(path.join(releaseDir, entry.name, "IIVO Glass.app"));
    }
  }

  const applications = "/Applications/IIVO Glass.app";
  if (fs.existsSync(applications)) add(applications);

  return [...found.values()].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export function collectGlassAppIdentityReport(): GlassAppIdentityReport {
  const isPackaged = app.isPackaged;
  const execPath = process.execPath;
  const bundlePath = macOSAppBundlePath(execPath);
  const bundleIdentifier = bundlePath ? readBundleIdentifier(bundlePath) : undefined;

  const packagingVariant = detectGlassPackagingVariant(execPath, isPackaged);
  const base: GlassAppIdentityReport = {
    appName: app.getName(),
    version: app.getVersion(),
    isPackaged,
    runningMode: isPackaged ? "packaged" : "dev",
    packagingVariant,
    packagingVariantLabel: formatPackagingVariantLabel(packagingVariant),
    defaultApp: process.defaultApp ?? false,
    execPath,
    exePath: app.getPath("exe"),
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    bundlePath,
    bundleIdentifier,
    expectedBundleId: GLASS_BUNDLE_ID,
    privacySettingsLabel: glassPrivacySettingsAppLabel(isPackaged),
    identityOk: false,
    identityNotes: [],
  };

  const evaluated = evaluatePackagedIdentity(base);
  return { ...base, ...evaluated };
}
