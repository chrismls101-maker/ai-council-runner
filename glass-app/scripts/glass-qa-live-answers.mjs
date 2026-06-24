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
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
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
  "active_listening",
];

const MIN_VISUAL_FIXTURES = 5;

function parseArgs() {
  const args = process.argv.slice(2);
  let count = 30;
  let seed = 1234;
  let category = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count" && args[i + 1]) count = Math.max(1, Number(args[++i]) || 30);
    if (args[i] === "--seed" && args[i + 1]) seed = Number(args[++i]) || 1234;
    if (args[i] === "--category" && args[i + 1]) category = String(args[++i]).trim();
  }
  // Category mode runs only that category and skips the 25-floor / 50-cap.
  if (category) return { count: Math.max(1, count), seed, category };
  return { count: Math.min(Math.max(count, 25), 50), seed, category: null };
}

function buildCategorySampleSet(category, count, seed) {
  // Focused category audits grade transcript-driven answers; skip visual fixtures.
  const pool = shuffleWithSeed(
    SCENARIOS.filter(
      (s) =>
        s.category === category &&
        s.liveAllowed &&
        !s.requiresManual &&
        s.testKind === "simulated",
    ),
    seed,
  );
  return pool.slice(0, count);
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

function loadJsonlSince(sinceIso) {
  if (!existsSync(RESULTS_JSONL)) return [];
  return readFileSync(RESULTS_JSONL, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((r) => !sinceIso || (r.finishedAt && r.finishedAt >= sinceIso));
}

function summarizeTransientOutcomes(records) {
  const hardFailures = records.filter((r) => r.pass === false);
  const transientRecovered = records.filter((r) => r.pass === true && r.transientRecovered === true);
  const timeoutUnrecovered = hardFailures.filter(
    (r) =>
      r.timeoutUnrecovered === true ||
      /timeout|timed out|abort/i.test(String(r.failReason ?? "")),
  );
  return { hardFailures, transientRecovered, timeoutUnrecovered };
}

function main() {
  const { count, seed, category } = parseArgs();
  mkdirSync(OUT, { recursive: true });

  const startedAt = new Date().toISOString();
  console.log(
    `IIVO Glass live answer sample · count=${count} · seed=${seed}${category ? ` · category=${category}` : ""}`,
  );

  checkServer()
    .then((server) => {
      console.log(`Server OK @ ${server.apiUrl}`);
      const models = server.health?.glassModels;
      if (models) {
        console.log(
          `Models: text=${models.text?.selectedModel} vision=${models.vision?.selectedModel} fallbackChain=${(models.fallbackChain ?? []).join("→")}`,
        );
      }

      const sample = category
        ? buildCategorySampleSet(category, count, seed)
        : buildSampleSet(count, seed);

      if (category) {
        if (sample.length === 0) {
          console.error(`No live-allowed scenarios for category ${category}`);
          process.exit(1);
        }
        console.log(`Selected ${sample.length} ${category} scenarios for focused audit.`);
      } else {
        const coverage = validateCategoryCoverage(sample);
        console.log(
          `Selected ${sample.length} scenarios (${coverage.visualCount} visual fixtures) · categories=${[...new Set(sample.map((s) => s.category))].sort().join(", ")}`,
        );
        if (coverage.errors.length > 0) {
          for (const err of coverage.errors) console.error(`COVERAGE: ${err}`);
          process.exit(1);
        }
      }

      let pass = 0;
      let fail = 0;
      for (const s of sample) {
        console.log(`\n--- ${s.id} [${s.category}] ${s.testKind} ---`);
        if (runScenarioAsk(s.id)) pass += 1;
        else fail += 1;
      }

      const runRecords = loadJsonlSince(startedAt);
      const transient = summarizeTransientOutcomes(runRecords);
      if (transient.transientRecovered.length > 0) {
        console.log(
          `\nTransient recoveries (${transient.transientRecovered.length}): ${transient.transientRecovered.map((r) => r.scenarioId).join(", ")}`,
        );
      }
      if (transient.timeoutUnrecovered.length > 0) {
        console.log(
          `Timeout unrecovered (${transient.timeoutUnrecovered.length}): ${transient.timeoutUnrecovered.map((r) => r.scenarioId).join(", ")}`,
        );
      }

      const CATEGORY_GRADED = ["video_learning", "creator_content", "sales_review"];
      const auditScript =
        category === "meeting_call"
          ? "glass-qa-meeting-audit.mjs"
          : category && CATEGORY_GRADED.includes(category)
            ? "glass-qa-category-audit.mjs"
            : "glass-live-scenario-audit.mjs";
      const audit = spawnSync(
        process.execPath,
        [join(__dirname, auditScript), "--run-since", startedAt],
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
            hardFailures: transient.hardFailures.length,
            transientRecovered: transient.transientRecovered.length,
            timeoutUnrecovered: transient.timeoutUnrecovered.length,
            transientRecoveredIds: transient.transientRecovered.map((r) => r.scenarioId),
            hardFailureIds: transient.hardFailures.map((r) => r.scenarioId),
            scenarioIds: sample.map((s) => s.id),
            categories: [...new Set(sample.map((s) => s.category))].sort(),
            requiredCategories: category ? [category] : REQUIRED_CATEGORIES,
            categoryFilter: category ?? null,
            missingCategories: category ? [] : validateCategoryCoverage(sample).missing,
            visualFixtures: sample.filter((s) => s.testKind === "controlled_visual_fixture").length,
          },
          null,
          2,
        ),
      );

      console.log(
        `\nDone: ${pass} pass / ${fail} hard fail · transient recovered=${transient.transientRecovered.length} · timeout unrecovered=${transient.timeoutUnrecovered.length} · jsonl=${RESULTS_JSONL}`,
      );
      if (fail > 0) process.exit(1);
      if (audit.status !== 0) process.exit(audit.status ?? 1);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}

main();
