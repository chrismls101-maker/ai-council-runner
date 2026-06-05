#!/usr/bin/env node
/**
 * Live IIVO Glass QA — hits the REAL IIVO API (not the E2E stub).
 *
 * Prerequisites:
 *   1. IIVO server running: `npm run dev` (from repo root)
 *   2. OPENAI_API_KEY in .env (server-side)
 *   3. Optional: IMAGE_VISION_ENABLED=true for visual ask check
 *
 * Usage:
 *   npm run glass:qa:live
 *   IIVO_API_URL=http://localhost:3001 npm run glass:qa:live
 *
 * Skips: system audio (no playback in automation), macOS screen capture permission.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const glassRoot = join(__dirname, "..");
const repoRoot = join(glassRoot, "..");

const STUB_CANARY = "IIVO Glass is working";
const COUNCIL_MARKERS = [
  "Final Action Plan",
  "Decision Quality",
  "Sales Attack",
  "Product Decision",
  "Final Judge",
];

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

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

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(60_000) });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { ok: res.ok, status: res.status, body };
}

function assertNoCouncil(text) {
  for (const marker of COUNCIL_MARKERS) {
    if (text.includes(marker)) {
      throw new Error(`Council marker leaked into Glass answer: ${marker}`);
    }
  }
}

function assertLiveAnswer(answer, { minLength = 40 } = {}) {
  if (!answer || typeof answer !== "string") {
    throw new Error("Empty answer from live API");
  }
  if (answer.includes(STUB_CANARY)) {
    throw new Error(`Answer looks like E2E stub text ("${STUB_CANARY}") — not a live OpenAI response`);
  }
  if (answer.trim().length < minLength) {
    throw new Error(`Answer too short (${answer.trim().length} chars) for a live response`);
  }
  assertNoCouncil(answer);
}

const env = { ...loadEnvFile(join(repoRoot, ".env")), ...process.env };
const apiUrl = (env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

/** @type {{ id: string, label: string, pass: boolean, detail?: string, answerPreview?: string }[]} */
const results = [];

function record(id, label, pass, detail = "", answerPreview = "") {
  results.push({ id, label, pass, detail, answerPreview });
  const mark = pass ? "✓" : "✗";
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ""}`);
  if (answerPreview) {
    console.log(`  answer: ${answerPreview.slice(0, 220)}${answerPreview.length > 220 ? "…" : ""}`);
  }
}

console.log("\n=== IIVO Glass LIVE QA (real API) ===\n");
console.log(`API: ${apiUrl}`);
console.log("Note: system-audio and macOS screen capture are manual — not required here.\n");

// --- Preflight ---
let health = null;
try {
  const res = await fetchJson(`${apiUrl}/api/health`);
  health = res.body;
  if (!res.ok || !health?.ok) {
    record(
      "preflight-health",
      "IIVO server health",
      false,
      `HTTP ${res.status} — start with: npm run dev`,
    );
    printSummary();
    process.exit(1);
  }
  record("preflight-health", "IIVO server health", true, "reachable");
} catch (err) {
  record(
    "preflight-health",
    "IIVO server health",
    false,
    err instanceof Error ? err.message : String(err),
  );
  console.log("\nStart the IIVO server first:\n  cd ~/Desktop/ai-council-runner && npm run dev\n");
  printSummary();
  process.exit(1);
}

const visionReady = health.vision?.enabled && health.vision?.configured;
const sttReady = health.stt?.configured;
record(
  "preflight-vision",
  "Vision configured on server",
  !!visionReady,
  visionReady ? "enabled" : health.vision?.reason ?? "disabled or missing key",
);
record(
  "preflight-stt",
  "STT configured on server",
  !!sttReady,
  sttReady ? "configured" : "optional for this run (no mic/audio tests)",
);

// --- Live direct asks (what Glass command bar uses) ---
const directPrompts = [
  {
    id: "glass-purpose",
    prompt:
      "What is IIVO Glass designed to help me do on my desktop? Answer in 2–4 sentences, practical and specific.",
  },
  {
    id: "workflow-help",
    prompt:
      "I'm working in an Electron overlay with a command bar. Give three concrete things I can ask Glass while coding — not about audio or YouTube.",
  },
  {
    id: "screen-workflow",
    prompt:
      "When should I use a visual screen question in Glass versus a plain text question? Keep it short.",
  },
];

for (const item of directPrompts) {
  try {
    const started = Date.now();
    const res = await fetchJson(`${apiUrl}/api/glass/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: item.prompt, responseStyle: "overlay" }),
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      record(item.id, `Live direct ask: ${item.id}`, false, `HTTP ${res.status}: ${JSON.stringify(res.body).slice(0, 120)}`);
      continue;
    }
    const { answer, routeUsed, model } = res.body ?? {};
    assertLiveAnswer(answer);
    if (routeUsed !== "glass_direct") {
      throw new Error(`Expected routeUsed glass_direct, got ${routeUsed}`);
    }
    record(
      item.id,
      `Live direct ask: ${item.id}`,
      true,
      `${routeUsed} · ${model ?? "model?"} · ${ms}ms`,
      answer,
    );
  } catch (err) {
    record(item.id, `Live direct ask: ${item.id}`, false, err instanceof Error ? err.message : String(err));
  }
}

// --- Live visual ask (API path only; real screen capture is manual) ---
if (visionReady) {
  try {
    const prompt = "What do you see on this screen? If the image is too small to read, say that clearly.";
    const started = Date.now();
    const res = await fetchJson(`${apiUrl}/api/glass/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        visualIntent: true,
        latestScreenshot: {
          imageDataUrl: TINY_PNG,
          label: "Live QA fixture",
          capturedAt: new Date().toISOString(),
        },
        responseStyle: "overlay",
      }),
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      record("visual-api", "Live visual ask (API)", false, `HTTP ${res.status}`);
    } else {
      const { answer, routeUsed, usedVision, model } = res.body ?? {};
      assertLiveAnswer(answer, { minLength: 15 });
      if (routeUsed !== "glass_visual_direct") {
        throw new Error(`Expected glass_visual_direct, got ${routeUsed}`);
      }
      record(
        "visual-api",
        "Live visual ask (API)",
        true,
        `${routeUsed} · vision=${usedVision} · ${model ?? "?"} · ${ms}ms`,
        answer,
      );
    }
  } catch (err) {
    record("visual-api", "Live visual ask (API)", false, err instanceof Error ? err.message : String(err));
  }
} else {
  record(
    "visual-api",
    "Live visual ask (API)",
    false,
    "skipped — enable IMAGE_VISION_ENABLED + OPENAI_API_KEY on server",
  );
}

record(
  "manual-screen",
  "Real screen capture + visual ask in Glass UI",
  false,
  "manual — grant Screen Recording, ask e.g. \"What's on my screen?\" (see GLASS_QA.md)",
);

printSummary();

function printSummary() {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  const required = results.filter((r) => r.id !== "manual-screen" && r.id !== "preflight-stt");
  const requiredPass = required.filter((r) => r.pass).length;

  console.log(`\n--- Summary: ${passed}/${results.length} checks passed (${requiredPass}/${required.length} required) ---\n`);

  if (failed.length) {
    console.log("Failed / skipped:");
    for (const f of failed) {
      console.log(`  - ${f.label}: ${f.detail}`);
    }
  }

  console.log("\nNext: run UI live E2E against the same server:");
  console.log("  npm run dev          # keep running in another terminal");
  console.log("  npm run glass:e2e:live\n");

  const hardFail = required.some((r) => !r.pass);
  process.exit(hardFail ? 1 : 0);
}
