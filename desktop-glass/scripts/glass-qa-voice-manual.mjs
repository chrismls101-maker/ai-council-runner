#!/usr/bin/env node
/**
 * IIVO Glass — Voice Mode manual QA harness.
 *
 * This is a MANUAL helper, not fake automation. It prints the required
 * hardware checklist (mic, system audio, Session Copilot, debrief) and a
 * logging template to fill in while testing. With --open it launches the
 * latest packaged IIVO Glass.app so you can run the checklist against a real
 * build.
 *
 * Usage (repo root):
 *   npm run glass:qa:voice:manual
 *   npm run glass:qa:voice:manual -- --open
 *
 * It never starts mic/screen capture itself and never records audio.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glassRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(glassRoot, "..");
const RELEASE = path.join(glassRoot, "release");

const args = process.argv.slice(2);
const shouldOpen = args.includes("--open");

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function findLatestApp() {
  if (!fs.existsSync(RELEASE)) return null;
  const apps = [];
  for (const entry of fs.readdirSync(RELEASE, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("mac")) continue;
    const appPath = path.join(RELEASE, entry.name, "IIVO Glass.app");
    if (fs.existsSync(appPath)) {
      apps.push({ appPath, mtime: fs.statSync(appPath).mtimeMs });
    }
  }
  if (apps.length === 0) return null;
  apps.sort((a, b) => b.mtime - a.mtime);
  return apps[0].appPath;
}

const env = { ...loadEnvFile(path.join(repoRoot, ".env")), ...process.env };
const apiUrl = (env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

console.log("\n=== IIVO Glass — Voice Mode manual QA ===\n");
console.log("This checklist requires REAL hardware. Automated tests cannot prove mic,");
console.log("system audio (BlackHole/Loopback), or live Session Copilot end-to-end.\n");

const health = await fetchJson(`${apiUrl}/api/health`);
console.log(`Server URL: ${apiUrl}`);
if (health) {
  console.log(`Server reachable: yes (ok=${health.ok})`);
  if (health.stt) {
    console.log(`STT: configured=${health.stt.configured}, endpoint=${health.stt.endpoint}`);
  }
  if (health.vision) {
    console.log(`Vision: enabled=${health.vision.enabled}, configured=${health.vision.configured}`);
  }
} else {
  console.log("Server reachable: NO — start `npm run dev` before voice/visual tests.");
}

console.log("\n--- Checklist (run in the packaged app) ---");
const checklist = [
  "Start packaged IIVO Glass.",
  "Confirm Setup is green (server, STT, capture, audio, permissions).",
  "Click the mic / Start Voice Mode.",
  'Speak: "Summarize what I am doing."',
  "Confirm a live transcript appears.",
  "Confirm an inline answer appears (glass_direct).",
  'Speak: "What do you see on my screen?"',
  "Confirm Looking… → capture → visual answer (glass_visual_direct).",
  "Start System Audio.",
  "Play a YouTube / video / audio source.",
  "Confirm transcript chunks arrive tagged system_audio.",
  "Start Session Copilot.",
  "Let it listen for ~5 minutes.",
  'Ask: "What matters so far?"',
  'Say/type: "I\'m done."',
  "Confirm a debrief is generated and saved.",
];
checklist.forEach((s, i) => console.log(`${String(i + 1).padStart(2, " ")}. [ ] ${s}`));

console.log("\n--- Capture these for each step while testing ---");
const logFields = [
  "mic permission (granted/denied)",
  "source type (microphone / system_audio)",
  "transcript chunks (count + sample text)",
  "STT errors (source-specific message, if any)",
  "route used (glass_direct / glass_visual_direct)",
  "model used (e.g. gpt-5.5-*) + fallback?",
  "latency (ms, listening→answer)",
  "session + debrief saved (yes/no, file path)",
  "no raw audio saved unless explicitly enabled (confirm)",
];
logFields.forEach((f) => console.log(`  - ${f}`));

console.log("\n--- Privacy invariants to verify ---");
console.log("  - No mic/screen capture starts on launch.");
console.log("  - Screenshots persisted as file paths only (no base64 in session JSON).");
console.log("  - Audio is NOT written to disk unless the user explicitly enables it.");
console.log("  - Open in IIVO uploads only on explicit click.");

if (shouldOpen) {
  const appPath = findLatestApp();
  if (!appPath) {
    console.log(
      "\n[--open] No packaged app found. Build first:\n  npm run glass:package:mac:arm64\n",
    );
    process.exitCode = 1;
  } else {
    console.log(`\n[--open] Launching ${appPath}`);
    try {
      execFileSync("open", [appPath], { stdio: "inherit" });
    } catch (err) {
      console.log(`[--open] Failed to open app: ${err instanceof Error ? err.message : err}`);
      process.exitCode = 1;
    }
  }
} else {
  console.log("\nTip: re-run with --open to launch the latest packaged app.");
}

console.log("\nSee desktop-glass/GLASS_QA.md and GLASS_LIMITATIONS.md for full checklists.\n");
