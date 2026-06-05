#!/usr/bin/env node
/**
 * Verify packaged IIVO Glass.app Info.plist (bundle id, display name, permission strings).
 *
 * Usage:
 *   node scripts/verify-mac-package-metadata.mjs
 *   node scripts/verify-mac-package-metadata.mjs path/to/IIVO\ Glass.app
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RELEASE = path.join(ROOT, "release");
const EXPECTED_BUNDLE_ID = "com.iivo.glass";
const REQUIRED_KEYS = [
  "CFBundleName",
  "CFBundleDisplayName",
  "CFBundleIdentifier",
  "NSMicrophoneUsageDescription",
  "NSScreenCaptureUsageDescription",
  "NSAudioCaptureUsageDescription",
];

function findPackagedApp(explicit) {
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (!fs.existsSync(resolved)) throw new Error(`App not found: ${resolved}`);
    return resolved;
  }
  if (!fs.existsSync(RELEASE)) {
    throw new Error(
      `No release/ folder. Run: npm run glass:package:mac:arm64 (from repo root)`,
    );
  }
  const candidates = [];
  for (const entry of fs.readdirSync(RELEASE, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("mac")) continue;
    const appPath = path.join(RELEASE, entry.name, "IIVO Glass.app");
    if (fs.existsSync(appPath)) {
      const stat = fs.statSync(appPath);
      candidates.push({ appPath, mtime: stat.mtimeMs });
    }
  }
  if (candidates.length === 0) {
    throw new Error(
      `No IIVO Glass.app under ${RELEASE}/mac-*. Build with npm run glass:package:mac:arm64`,
    );
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].appPath;
}

function readPlistValue(appPath, key) {
  return execFileSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, path.join(appPath, "Contents/Info.plist")], {
    encoding: "utf8",
  }).trim();
}

function main() {
  const appPath = findPackagedApp(process.argv[2]);
  const iconPath = path.join(appPath, "Contents/Resources/icon.icns");
  const errors = [];

  console.log(`Checking ${appPath}`);

  for (const key of REQUIRED_KEYS) {
    try {
      const value = readPlistValue(appPath, key);
      if (!value) errors.push(`${key} is empty`);
      else console.log(`  ✓ ${key}`);
    } catch {
      errors.push(`Missing ${key}`);
    }
  }

  const bundleId = readPlistValue(appPath, "CFBundleIdentifier");
  if (bundleId !== EXPECTED_BUNDLE_ID) {
    errors.push(`CFBundleIdentifier expected ${EXPECTED_BUNDLE_ID}, got ${bundleId}`);
  }

  const name = readPlistValue(appPath, "CFBundleName");
  const display = readPlistValue(appPath, "CFBundleDisplayName");
  if (name !== "IIVO Glass") errors.push(`CFBundleName expected "IIVO Glass", got ${name}`);
  if (display !== "IIVO Glass") {
    errors.push(`CFBundleDisplayName expected "IIVO Glass", got ${display}`);
  }

  if (!fs.existsSync(iconPath)) {
    errors.push(`Missing icon.icns at ${iconPath}`);
  } else {
    console.log("  ✓ icon.icns");
  }

  if (errors.length) {
    console.error("\nVerification failed:");
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log("\nPackaged app identity OK — IIVO Glass should appear in macOS Privacy & Security.");
}

main();
