#!/usr/bin/env node
/**
 * Manual QA prep report for IIVO Glass — no mic/screen permissions required.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const glassRoot = join(__dirname, "..");
const repoRoot = join(glassRoot, "..");

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
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

const env = { ...loadEnvFile(join(repoRoot, ".env")), ...process.env };
const apiUrl = (env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

console.log("\n=== IIVO Glass manual QA report ===\n");
console.log(`Server URL: ${apiUrl}`);
console.log(`Glass E2E mode: ${process.env.IIVO_GLASS_E2E === "1" ? "yes" : "no"}`);
console.log(`IMAGE_VISION_ENABLED (env): ${env.IMAGE_VISION_ENABLED ?? "(unset — server decides)"}`);

const health = await fetchJson(`${apiUrl}/api/health`);
if (health) {
  console.log(`Server reachable: yes (ok=${health.ok})`);
  if (health.vision) {
    console.log(
      `Vision: enabled=${health.vision.enabled}, configured=${health.vision.configured}${health.vision.reason ? ` (${health.vision.reason})` : ""}`,
    );
  }
  if (health.stt) {
    console.log(`STT: configured=${health.stt.configured}, endpoint=${health.stt.endpoint}`);
  }
} else {
  console.log("Server reachable: no — start IIVO server before visual/STT manual tests");
}

const visionOnly = await fetchJson(`${apiUrl}/api/config/vision`);
if (visionOnly && !health?.vision) {
  console.log(`Vision config endpoint: enabled=${visionOnly.enabled}, configured=${visionOnly.configured}`);
}

console.log("\n--- Retention / privacy (expected defaults) ---");
console.log("saveVisualAsksToSession: on during live session (user setting)");
console.log("autoUploadCapturesToContext: off — upload only via Open in IIVO or explicit capture upload");
console.log("Visual ask: capture-on-ask only (no periodic Live Vision)");

console.log("\n--- Display / capture (verify in app panel) ---");
console.log("Connected displays: open Glass panel → System status → display line");
console.log("Selected Glass display: Settings → display target (primary / follow mouse / HDMI id)");
console.log("Screen Recording: System Settings → Privacy → Screen Recording → IIVO Glass");

console.log("\n--- Manual test steps ---");
const steps = [
  "Launch: npm run glass:dev (server + Glass)",
  "Command bar: non-visual prompt → inline answer, no browser open",
  "Visual ask: \"What's on my screen?\" → looking card → answer, whole-screen mode",
  "Text/error visual: \"read this error\" → text clarity + crop in panel diagnostics",
  "Open in IIVO: only after answer → uploads ephemeral screenshot on click, opens lensAsk URL",
  "Permissions: grant Screen Recording + Microphone if testing voice",
  "Multi-display: set HDMI display target, confirm capture label in status",
];
steps.forEach((s, i) => console.log(`${i + 1}. ${s}`));

console.log("\n--- Deferred by design ---");
console.log("Periodic Live Vision: not implemented (privacy, cost, performance). Future: ON indicator, stop, frequency, retention.");
console.log("Full dashboard /iivo-glass: not built yet");
console.log("\nSee desktop-glass/GLASS_QA.md and GLASS_LIMITATIONS.md for full checklists.\n");
