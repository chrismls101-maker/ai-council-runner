#!/usr/bin/env node
/**
 * Focused live AI answer quality sample — captures 25–40 answers across categories.
 *
 * Usage:
 *   node scripts/glass-qa-live-answers.mjs --count 30 --seed 1234
 *
 * Requires live server @ IIVO_API_URL (default http://localhost:3001) + OPENAI_API_KEY on server.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCENARIOS,
  shuffleWithSeed,
} from "./qa-scenarios/iivo-glass-scenarios.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = "/tmp/iivo-glass-overnight";
const RESULTS_JSONL = join(OUT, "live-scenario-results.jsonl");
const RUN_MARKER = join(OUT, "live-answers-run.json");

/** Live-allowed categories targeted for live answer audit (≥10). */
const REQUIRED_CATEGORIES = [
  "founder_strategy",
  "executive_review",
  "research_comparison",
  "coding_building",
  "sales_review",
  "meeting_call",
  "studying",
  "creator_content",
  "session_debrief",
  "visual_ask",
  "video_learning",
  "general_user",
];

const MIN_VISUAL_FIXTURES = 5;

function parseArgs() {
  const args = process.argv.slice(2);
  let count = 30;
  let seed = 1234;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count" && args[i + 1]) count = Math.max(1, Number(args[++i]) || 30);
    if (args[i] === "--seed" && args[i + 1]) seed = Number(args[++i]) || 1234;
  }
  return { count: Math.min(Math.max(count, 25), 40), seed };
}

function pickScenarioForCategory(category, preferVisual = false) {
  const pool = SCENARIOS.filter(
    (s) => s.category === category && s.liveAllowed && (!preferVisual || s.testKind === "controlled_visual_fixture"),
  );
  if (pool.length === 0) return null;
  if (preferVisual) {
    return pool.find((s) => s.testKind === "controlled_visual_fixture") ?? pool[0];
  }
  return pool.find((s) => s.testKind === "simulated") ?? pool[0];
}

function buildSampleSet(count, seed) {
  const selected = [];
  const seen = new Set();

  const add = (scenario) => {
    if (!scenario || seen.has(scenario.id)) return false;
    seen.add(scenario.id);
    selected.push(scenario);
    return true;
  };

  for (const cat of REQUIRED_CATEGORIES) {
    const preferVisual = cat === "visual_ask" || cat === "studying";
    add(pickScenarioForCategory(cat, preferVisual));
  }

  let visualFixtures = selected.filter((s) => s.testKind === "controlled_visual_fixture").length;
  const visualPool = SCENARIOS.filter(
    (s) => s.liveAllowed && s.testKind === "controlled_visual_fixture",
  );
  for (const s of shuffleWithSeed(visualPool, seed + 99)) {
    if (visualFixtures >= MIN_VISUAL_FIXTURES) break;
    if (add(s)) visualFixtures += 1;
  }

  const livePool = shuffleWithSeed(
    SCENARIOS.filter((s) => s.liveAllowed),
    seed,
  );
  for (const s of livePool) {
    if (selected.length >= count) break;
    add(s);
  }

  return selected.slice(0, count);
}

function validateCategoryCoverage(sample) {
  const covered = new Set(sample.map((s) => s.category));
  const missing = REQUIRED_CATEGORIES.filter((c) => !covered.has(c));
  const visualCount = sample.filter((s) => s.testKind === "controlled_visual_fixture").length;
  const errors = [];
  if (missing.length > 0) {
    errors.push(`Missing required categories: ${missing.join(", ")}`);
  }
  if (visualCount < MIN_VISUAL_FIXTURES) {
    errors.push(`Need at least ${MIN_VISUAL_FIXTURES} visual fixtures, got ${visualCount}`);
  }
  return { missing, visualCount, errors };
}

async function checkServer() {
  const apiUrl = (process.env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  try {
    const res = await fetch(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { apiUrl, health: data };
  } catch (err) {
    throw new Error(
      `Live server not reachable at ${apiUrl} — start with npm run dev. ${err instanceof Error ? err.message : err}`,
    );
  }
}

function runScenarioAsk(scenarioId) {
  const script = join(__dirname, "glass-live-scenario-ask.mjs");
  const r = spawnSync(process.execPath, [script, "--scenario-id", scenarioId], {
    stdio: "inherit",
    env: process.env,
  });
  return r.status === 0;
}

function main() {
  const { count, seed } = parseArgs();
  mkdirSync(OUT, { recursive: true });

  const startedAt = new Date().toISOString();
  console.log(`IIVO Glass live answer sample · count=${count} · seed=${seed}`);

  checkServer()
    .then((server) => {
      console.log(`Server OK @ ${server.apiUrl}`);
      const models = server.health?.glassModels;
      if (models) {
        console.log(
          `Models: text=${models.text?.selectedModel} vision=${models.vision?.selectedModel} fallbackChain=${(models.fallbackChain ?? []).join("→")}`,
        );
      }

      const sample = buildSampleSet(count, seed);
      const coverage = validateCategoryCoverage(sample);
      console.log(
        `Selected ${sample.length} scenarios (${coverage.visualCount} visual fixtures) · categories=${[...new Set(sample.map((s) => s.category))].sort().join(", ")}`,
      );
      if (coverage.errors.length > 0) {
        for (const err of coverage.errors) console.error(`COVERAGE: ${err}`);
        process.exit(1);
      }

      let pass = 0;
      let fail = 0;
      for (const s of sample) {
        console.log(`\n--- ${s.id} [${s.category}] ${s.testKind} ---`);
        if (runScenarioAsk(s.id)) pass += 1;
        else fail += 1;
      }

      const audit = spawnSync(
        process.execPath,
        [join(__dirname, "glass-live-scenario-audit.mjs"), "--run-since", startedAt],
        { stdio: "inherit", env: process.env },
      );

      writeFileSync(
        RUN_MARKER,
        JSON.stringify(
          {
            startedAt,
            finishedAt: new Date().toISOString(),
            count: sample.length,
            seed,
            pass,
            fail,
            scenarioIds: sample.map((s) => s.id),
            categories: [...new Set(sample.map((s) => s.category))].sort(),
            requiredCategories: REQUIRED_CATEGORIES,
            missingCategories: coverage.missing,
            visualFixtures: coverage.visualCount,
          },
          null,
          2,
        ),
      );

      console.log(`\nDone: ${pass} pass / ${fail} fail · jsonl=${RESULTS_JSONL}`);
      if (fail > 0) process.exit(1);
      if (audit.status !== 0) process.exit(audit.status ?? 1);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}

main();
