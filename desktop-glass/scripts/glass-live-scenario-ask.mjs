#!/usr/bin/env node
// Live AI ask for a single QA scenario (rate-limited by caller). Uses fixture HTML
// as text context when scenario has controlled_visual_fixture.
//
// Usage: node scripts/glass-live-scenario-ask.mjs --scenario-id founder_strategy_01
//
// Sanitized answer samples append to /tmp/iivo-glass-overnight/live-scenario-results.jsonl

import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getScenarioById, FIXTURE_PAGES } from "./qa-scenarios/iivo-glass-scenarios.mjs";
import { scoreGlassAnswerQuality } from "./lib/glass-answer-quality.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GLASS_ROOT = join(__dirname, "..");
const OUT = "/tmp/iivo-glass-overnight";
const RESULTS_JSONL = join(OUT, "live-scenario-results.jsonl");

const STUB_CANARY = "IIVO Glass is working";
const COUNCIL_MARKERS = ["Final Action Plan", "Decision Quality", "Sales Attack", "Product Decision", "Final Judge"];
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function parseArgs() {
  const i = process.argv.indexOf("--scenario-id");
  return i >= 0 ? process.argv[i + 1] : null;
}

/** @param {string} text @param {number} [maxLen] */
function sanitizeText(text, maxLen = 500) {
  if (!text) return "";
  let s = String(text)
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, "[redacted-image]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, "[redacted-key]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted-token]")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > maxLen) s = `${s.slice(0, maxLen)}…`;
  return s;
}

/** @param {import('./qa-scenarios/iivo-glass-scenarios.mjs').QaScenario} scenario */
function contextSummary(scenario) {
  const parts = [];
  if (scenario.screenContextText) parts.push(scenario.screenContextText.slice(0, 160));
  if (scenario.transcriptChunks?.length) {
    parts.push(`transcript(${scenario.transcriptChunks.length} chunks)`);
  }
  if (scenario.fixturePage) parts.push(`fixture:${scenario.fixturePage}`);
  if (scenario.appName) parts.push(`app:${scenario.appName}`);
  return parts.join(" · ") || "(none)";
}

function appendResult(record) {
  mkdirSync(OUT, { recursive: true });
  appendFileSync(RESULTS_JSONL, `${JSON.stringify(record)}\n`);
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
let data = {};
let httpStatus = 0;
try {
  const res = await fetch(`${apiUrl}/api/glass/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  httpStatus = res.status;
  data = await res.json().catch(() => ({}));

  if (!res.ok) {
  appendResult({
    scenarioId,
    category: scenario.category,
    testKind: scenario.testKind,
    promptPreview: sanitizeText(scenario.userPrompt, 200),
    contextSummary: contextSummary(scenario),
    routeUsed: data.routeUsed ?? null,
    model: data.modelUsed ?? data.model ?? null,
    modelRequested: data.modelRequested ?? null,
    modelUsed: data.modelUsed ?? data.model ?? null,
    fallbackUsed: data.fallbackUsed ?? false,
    latencyMs: Date.now() - started,
    pass: false,
    failReason: `HTTP ${res.status}`,
    finishedAt: new Date().toISOString(),
  });
    console.error(`FAIL HTTP ${res.status}`);
    process.exit(1);
  }

  assertAnswer(data.answer);
  if (data.routeUsed !== expectRoute && expectRoute === "glass_direct") {
    if (data.routeUsed !== "glass_visual_direct" && data.routeUsed !== "glass_direct") {
      throw new Error(`Bad route ${data.routeUsed}`);
    }
  }
} catch (err) {
  const ms = Date.now() - started;
  appendResult({
    scenarioId,
    category: scenario.category,
    testKind: scenario.testKind,
    promptPreview: sanitizeText(scenario.userPrompt, 200),
    contextSummary: contextSummary(scenario),
    routeUsed: data.routeUsed ?? null,
    model: data.model ?? null,
    latencyMs: ms,
    pass: false,
    failReason: err instanceof Error ? err.message : String(err),
    finishedAt: new Date().toISOString(),
  });
  console.error(`FAIL ${scenarioId}: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const ms = Date.now() - started;
const answerPreview = sanitizeText(data.answer, 500);
const shortAnswer = sanitizeText(data.shortAnswer ?? data.answer?.slice(0, 200), 200);
const qualityFlags = scoreGlassAnswerQuality({
  answer: data.answer,
  contextSummary: contextSummary(scenario),
  routeUsed: data.routeUsed,
  expectedRoute: expectRoute,
  contextKeywords: scenario.fixtureExpectedKeywords,
});

appendResult({
  scenarioId,
  category: scenario.category,
  testKind: scenario.testKind,
  promptPreview: sanitizeText(scenario.userPrompt, 200),
  contextSummary: contextSummary(scenario),
  routeUsed: data.routeUsed,
  model: data.modelUsed ?? data.model ?? null,
  modelRequested: data.modelRequested ?? null,
  modelUsed: data.modelUsed ?? data.model ?? null,
  fallbackUsed: data.fallbackUsed ?? false,
  latencyMs: ms,
  answerPreview,
  shortAnswer,
  qualityFlags,
  pass: true,
  finishedAt: new Date().toISOString(),
});

console.log(
  `OK live scenario ${scenarioId} [${scenario.testKind}] · ${data.routeUsed} · ${data.modelUsed ?? data.model ?? "unknown-model"}${data.fallbackUsed ? " (fallback)" : ""} · ${ms}ms · category=${scenario.category}`,
);
console.log(`answer: ${sanitizeText(shortAnswer || answerPreview, 160)}`);
process.exit(0);
