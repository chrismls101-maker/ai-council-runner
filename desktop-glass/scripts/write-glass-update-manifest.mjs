#!/usr/bin/env node
/**
 * Write glass-update-manifest.json after packaging so running Glass can detect new builds.
 *
 * Usage:
 *   node scripts/write-glass-update-manifest.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glassRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(glassRoot, "..");

const pkg = JSON.parse(fs.readFileSync(path.join(glassRoot, "package.json"), "utf8"));
const version = pkg.version ?? "0.1.0";
const buildId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const releaseDir = path.join(glassRoot, "release");

function dmgPath(name) {
  const file = path.join(releaseDir, name);
  return fs.existsSync(file) ? file : "";
}

function fileUrlFor(absPath) {
  if (!absPath) return "";
  return `file://${absPath.split(path.sep).join("/")}`;
}

function publicDownloadUrl(version, filename) {
  const base = (process.env.IIVO_PUBLIC_URL ?? "https://iivo.ai").replace(/\/+$/, "");
  return `${base}/api/glass/update/download/${encodeURIComponent(filename)}`;
}

const arm64Dmg = dmgPath(`IIVO Glass-${version}-arm64.dmg`);
const universalDmg = dmgPath(`IIVO Glass-${version}-universal.dmg`);
const arm64DmgName = `IIVO-Glass-${version}-arm64.dmg`;
const publicArm64Dmg = publicDownloadUrl(version, arm64DmgName);

const RELEASE_NOTES = {
  "0.1.11": [
    "Fix Check for updates — pulls releases through iivo.ai (private GitHub repo).",
    "Update check now shows Checking… and surfaces errors in Setup.",
  ],
  "0.1.10": [
    "Unlock layout: dock and command bar stay put when you unlock — only move when you drag.",
    "Fix crash on unlock (missing click-through sync import).",
    "Squirrel auto-update from GitHub Releases — Update now installs without a manual DMG.",
    "Setup panel clarifies dev vs installed update paths.",
  ],
  "0.1.9": [
    "Onboarding waits until boot splash finishes; Esc skips globally if stuck.",
    "Onboarding always opens on your primary display with a larger rescue hint.",
    "Dock and command bar reset to correct positions after onboarding; unlock layout fix.",
    "Landing install guide, privacy, and terms pages on iivo.ai.",
  ],
  "0.1.8": [
    "Command bar Live Translate shortcut (Languages icon) — one-click media translate from system audio.",
    "Live Translate upgrades: caption overlay, panel setup, Listen/Meetings toggles, private-no-save defaults.",
    "Dock layout fixes: priority ordering, sizing for Pause/End session, clickable action buttons.",
    "Command bar and dock unlock overlay (dark scrim + drag hint), lock/rotate tooltips.",
    "Glass hover tooltips on command bar translate and layout controls.",
  ],
};

function releaseNotesFor(v) {
  const bullets = RELEASE_NOTES[v];
  if (bullets?.length) {
    return [`IIVO Glass v${v} is ready to install.`, "", ...bullets.map((b) => `• ${b}`)].join("\n");
  }
  return `IIVO Glass v${v} is ready to install.`;
}

const manifest = {
  version,
  buildId,
  releasedAt: new Date().toISOString(),
  title: "NEW SYSTEM UPDATE",
  notes: releaseNotesFor(version),
  downloadUrl: publicArm64Dmg || fileUrlFor(arm64Dmg) || fileUrlFor(universalDmg),
  darwinArm64Dmg: publicArm64Dmg || arm64Dmg,
  darwinUniversalDmg: universalDmg,
};

const targets = [
  path.join(glassRoot, "glass-update-manifest.json"),
  path.join(repoRoot, "desktop-glass/glass-update-manifest.json"),
];

for (const target of targets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${target}`);
}

console.log(JSON.stringify(manifest, null, 2));

const arm64Zip = dmgPath(`IIVO Glass-${version}-arm64-mac.zip`);
const latestMacYml = path.join(releaseDir, "latest-mac.yml");
if (arm64Zip || fs.existsSync(latestMacYml)) {
  console.log("\n[glass:release] Squirrel auto-update assets (upload to GitHub release v" + version + "):");
  if (arm64Zip) console.log(`  - ${arm64Zip}`);
  if (fs.existsSync(latestMacYml)) console.log(`  - ${latestMacYml}`);
  console.log("  Packaged Glass checks GitHub Releases via electron-updater (no DMG reinstall).");
}
