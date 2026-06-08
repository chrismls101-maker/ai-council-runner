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

const arm64Dmg = dmgPath(`IIVO Glass-${version}-arm64.dmg`);
const universalDmg = dmgPath(`IIVO Glass-${version}-universal.dmg`);

const RELEASE_NOTES = {
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
  downloadUrl: fileUrlFor(arm64Dmg) || fileUrlFor(universalDmg),
  darwinArm64Dmg: arm64Dmg,
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
