#!/usr/bin/env node
// Live AI ask for a single QA scenario (rate-limited by caller). Uses fixture HTML
// as text context when scenario has controlled_visual_fixture.
//
// Usage: node scripts/glass-live-scenario-ask.mjs --scenario-id founder_strategy_01

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getScenarioById, FIXTURE_PAGES } from "./qa-scenarios/iivo-glass-scenarios.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GLASS_ROOT = join(__dirname, "..");

const STUB_CANARY = "IIVO Glass is working";
const COUNCIL_MARKERS = ["Final Action Plan", "Decision Quality", "Sales Attack", "Product Decision", "Final Judge"];
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function parseArgs() {
  const i = process.argv.indexOf("--scenario-id");
  return i >= 0 ? process.argv[i + 1] : null;
}

const scenarioId = parseArgs();
if (!scenarioId) {
  console.error("Usage: node scripts/glass-live-scenario-ask.mjs --scenario-id <id>");
  process.exit(2);
}

const scenario = getScenarioById(scenarioId);
if (!scenario) {
  console.error(`Unknown scenario: ${scenarioId}`);
  process.exit(2);
}
if (!scenario.liveAllowed) {
  console.error(`Scenario ${scenarioId} is not liveAllowed`);
  process.exit(2);
}

const apiUrl = (process.env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

function assertAnswer(answer) {
  if (!answer?.trim()) throw new Error("Empty answer");
  if (answer.includes(STUB_CANARY)) throw new Error("Stub canary");
  if (answer.trim().length < 15) throw new Error("Too short");
  for (const m of COUNCIL_MARKERS) {
    if (answer.includes(m)) throw new Error(`Council: ${m}`);
  }
}

const prompt = `${scenario.userPrompt}\n\nContext: ${scenario.screenContextText}\n${scenario.transcriptChunks.join(" ")}`.slice(0, 2000);

let body = { prompt, responseStyle: "overlay" };
let expectRoute = "glass_direct";

if (scenario.testKind === "controlled_visual_fixture" && scenario.fixturePage) {
  const fix = FIXTURE_PAGES[scenario.fixturePage];
  const fixPath = join(GLASS_ROOT, fix.path);
  if (existsSync(fixPath)) {
    const html = readFileSync(fixPath, "utf8");
    body = {
      prompt: `${scenario.userPrompt} What do you see on this screen?`,
      visualIntent: true,
      latestScreenshot: {
        imageDataUrl: TINY_PNG,
        label: `Fixture: ${fix.label}`,
        capturedAt: new Date().toISOString(),
        fixtureText: html.replace(/<[^>]+>/g, " ").slice(0, 500),
      },
      responseStyle: "overlay",
    };
    expectRoute = "glass_visual_direct";
  }
}

const started = Date.now();
const res = await fetch(`${apiUrl}/api/glass/ask`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(60_000),
});
const ms = Date.now() - started;
const data = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error(`FAIL HTTP ${res.status}`);
  process.exit(1);
}

try {
  assertAnswer(data.answer);
  if (data.routeUsed !== expectRoute && expectRoute === "glass_direct") {
    // visual route may fall back to direct if vision disabled
    if (data.routeUsed !== "glass_visual_direct" && data.routeUsed !== "glass_direct") {
      throw new Error(`Bad route ${data.routeUsed}`);
    }
  }
} catch (err) {
  console.error(`FAIL ${scenarioId}: ${err.message}`);
  process.exit(1);
}

console.log(
  `OK live scenario ${scenarioId} [${scenario.testKind}] · ${data.routeUsed} · ${ms}ms · category=${scenario.category}`,
);
process.exit(0);
