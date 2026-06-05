#!/usr/bin/env node
/**
 * IIVO Glass — Voice Mode manual QA harness + report runner.
 *
 * This is a MANUAL helper, not fake automation. It prints the required hardware
 * checklist (mic, system audio, Session Copilot, debrief), records pass / fail /
 * unverified results, and saves a local markdown report:
 *
 *   /tmp/iivo-glass-voice-manual/VOICE_MANUAL_QA_REPORT.md
 *
 * It NEVER records raw audio and NEVER stores screenshots/base64 — only
 * metadata (permission, source, signal yes/no, route, model, latency, etc.).
 * Anything the tester did not run is recorded honestly as UNVERIFIED.
 *
 * Usage (repo root):
 *   npm run glass:qa:voice:manual                 # print checklist + write template report
 *   npm run glass:qa:voice:manual -- --open       # also launch the latest packaged app
 *   npm run glass:qa:voice:manual -- --interactive# prompt for pass/fail + metadata, then save
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glassRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(glassRoot, "..");
const RELEASE = path.join(glassRoot, "release");
const REPORT_DIR = "/tmp/iivo-glass-voice-manual";
const REPORT_PATH = path.join(REPORT_DIR, "VOICE_MANUAL_QA_REPORT.md");

const args = process.argv.slice(2);
const shouldOpen = args.includes("--open");
const interactive = args.includes("--interactive") || args.includes("-i");

const CHECKLIST = [
  "Open packaged IIVO Glass.",
  "Confirm Setup is green (server, STT, capture, audio, permissions).",
  "Start Voice Mode (mic starts only after this action).",
  'Speak: "Summarize what I am doing."',
  "Confirm a live transcript appears.",
  "Confirm a GPT-5.5 direct answer appears (glass_direct).",
  'Speak: "What do you see on my screen?"',
  "Confirm Looking… → capture → visual answer (glass_visual_direct).",
  "Start System Audio.",
  "Play a YouTube / audio source through BlackHole.",
  "Confirm system-audio transcript chunks arrive.",
  "Start Session Copilot.",
  "Let it listen for ~5 minutes.",
  'Ask: "What matters so far?"',
  'Say/type: "I\'m done."',
  "Confirm a debrief is generated and saved.",
];

const METADATA_FIELDS = [
  ["mic_permission", "mic permission (granted/denied/unverified)"],
  ["system_audio_selected", "system audio selected (yes/no/unverified)"],
  ["blackhole_signal", "BlackHole signal received (yes/no/unverified)"],
  ["stt_transcript_received", "STT transcript received (yes/no/unverified)"],
  ["route_used", "route used (glass_direct / glass_visual_direct)"],
  ["model_used", "model used (e.g. gpt-5.5-*) + fallback?"],
  ["latency", "latency (ms, listening→answer)"],
  ["screen_capture_worked", "screen capture worked (yes/no/unverified)"],
  ["debrief_generated", "debrief generated (yes/no/unverified)"],
  ["errors", "errors observed (source-specific message, if any)"],
];

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
    if (fs.existsSync(appPath)) apps.push({ appPath, mtime: fs.statSync(appPath).mtimeMs });
  }
  if (apps.length === 0) return null;
  apps.sort((a, b) => b.mtime - a.mtime);
  return apps[0].appPath;
}

function normalizeResult(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (["p", "pass", "y", "yes", "ok"].includes(v)) return "PASS";
  if (["f", "fail", "n", "no"].includes(v)) return "FAIL";
  return "UNVERIFIED";
}

function buildReport({ apiUrl, health, results, metadata, notes }) {
  const now = new Date().toISOString();
  const counts = results.reduce(
    (acc, r) => ((acc[r.result] = (acc[r.result] ?? 0) + 1), acc),
    { PASS: 0, FAIL: 0, UNVERIFIED: 0 },
  );

  const micVerified = metadata.mic_permission && metadata.mic_permission !== "unverified";
  const sysVerified =
    metadata.system_audio_selected && metadata.system_audio_selected !== "unverified";
  const captureVerified =
    metadata.screen_capture_worked && metadata.screen_capture_worked !== "unverified";

  const lines = [];
  lines.push("# IIVO Glass — Voice Mode Manual QA Report");
  lines.push("");
  lines.push(`- Generated: ${now}`);
  lines.push(`- Mode: ${interactive ? "interactive" : "template (fill in by hand)"}`);
  lines.push(`- Server: ${apiUrl} — reachable: ${health ? "yes" : "NO"}`);
  if (health?.stt) lines.push(`- STT: configured=${health.stt.configured}, endpoint=${health.stt.endpoint}`);
  if (health?.vision)
    lines.push(`- Vision: enabled=${health.vision.enabled}, configured=${health.vision.configured}`);
  lines.push("");
  lines.push(
    `**Summary:** PASS=${counts.PASS} · FAIL=${counts.FAIL} · UNVERIFIED=${counts.UNVERIFIED} of ${results.length} steps`,
  );
  lines.push("");
  lines.push("## Honesty flags");
  lines.push(`- Microphone: ${micVerified ? "verified" : "**UNVERIFIED** (tester did not confirm)"}`);
  lines.push(
    `- System audio / BlackHole: ${sysVerified ? "verified" : "**UNVERIFIED** (tester did not confirm)"}`,
  );
  lines.push(
    `- Packaged screen capture: ${captureVerified ? "verified" : "**UNVERIFIED** (tester did not confirm)"}`,
  );
  lines.push("");
  lines.push("## Checklist");
  lines.push("");
  lines.push("| # | Step | Result | Notes |");
  lines.push("|---|------|--------|-------|");
  results.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | ${r.step.replace(/\|/g, "\\|")} | ${r.result} | ${(r.note ?? "").replace(/\|/g, "\\|")} |`,
    );
  });
  lines.push("");
  lines.push("## Metadata (no raw audio / no screenshots / no base64)");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|-------|-------|");
  for (const [key, label] of METADATA_FIELDS) {
    lines.push(`| ${label} | ${(metadata[key] ?? "unverified").replace(/\|/g, "\\|")} |`);
  }
  lines.push("");
  lines.push("## Privacy invariants verified");
  lines.push("- [ ] No mic/screen capture starts on launch.");
  lines.push("- [ ] Screenshots persisted as file paths only (no base64 in session JSON).");
  lines.push("- [ ] Audio is NOT written to disk unless the user explicitly enables it.");
  lines.push("- [ ] Open in IIVO uploads only on explicit click.");
  if (notes?.trim()) {
    lines.push("");
    lines.push("## Tester notes");
    lines.push(notes.trim());
  }
  lines.push("");
  return lines.join("\n");
}

const env = { ...loadEnvFile(path.join(repoRoot, ".env")), ...process.env };
const apiUrl = (env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

console.log("\n=== IIVO Glass — Voice Mode manual QA ===\n");
console.log("This checklist requires REAL hardware. Automated tests cannot prove mic,");
console.log("system audio (BlackHole/Loopback), or live Session Copilot end-to-end.\n");

const health = await fetchJson(`${apiUrl}/api/health`);
console.log(`Server URL: ${apiUrl}`);
console.log(
  health
    ? `Server reachable: yes (ok=${health.ok})`
    : "Server reachable: NO — start `npm run dev` before voice/visual tests.",
);

let results = CHECKLIST.map((step) => ({ step, result: "UNVERIFIED", note: "" }));
let metadata = Object.fromEntries(METADATA_FIELDS.map(([k]) => [k, "unverified"]));
let testerNotes = "";

if (interactive) {
  const rl = readline.createInterface({ input, output });
  console.log("\n--- Interactive run: p=pass, f=fail, enter=unverified ---\n");
  for (let i = 0; i < CHECKLIST.length; i++) {
    const ans = await rl.question(`${i + 1}. ${CHECKLIST[i]}\n   result [p/f/enter]: `);
    results[i].result = normalizeResult(ans);
    if (results[i].result === "FAIL") {
      results[i].note = (await rl.question("   note (what failed): ")).trim();
    }
  }
  console.log("\n--- Metadata ---");
  for (const [key, label] of METADATA_FIELDS) {
    const v = (await rl.question(`${label}: `)).trim();
    if (v) metadata[key] = v;
  }
  testerNotes = (await rl.question("\nAny extra notes: ")).trim();
  rl.close();
} else {
  console.log("\n--- Checklist (run in the packaged app) ---");
  CHECKLIST.forEach((s, i) => console.log(`${String(i + 1).padStart(2, " ")}. [ ] ${s}`));
  console.log("\n--- Capture these (metadata only — no raw audio/screenshots) ---");
  METADATA_FIELDS.forEach(([, label]) => console.log(`  - ${label}`));
  console.log("\nRe-run with --interactive to record pass/fail + metadata into the report.");
}

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(REPORT_PATH, buildReport({ apiUrl, health, results, metadata, notes: testerNotes }));
console.log(`\nReport written: ${REPORT_PATH}`);
console.log(
  interactive
    ? "Recorded your results. Unverified items are flagged honestly in the report."
    : "Template report written with all items UNVERIFIED. Fill it in or use --interactive.",
);

if (shouldOpen) {
  const appPath = findLatestApp();
  if (!appPath) {
    console.log("\n[--open] No packaged app found. Build first:\n  npm run glass:package:mac:arm64\n");
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
}

console.log("\nSee desktop-glass/GLASS_QA.md and GLASS_LIMITATIONS.md for full checklists.\n");
