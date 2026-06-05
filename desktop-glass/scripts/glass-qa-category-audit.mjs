#!/usr/bin/env node
/**
 * Focused category answer audit for the non-meeting answer-quality categories
 * (video_learning / creator_content / sales_review). Reads
 * live-scenario-results.jsonl, filters category records in the run window, and
 * grades them: verdict, missing-context handling, generic/template flag, and
 * pairwise template similarity.
 *
 * Usage:
 *   node scripts/glass-qa-category-audit.mjs --run-since <iso>
 *
 * Output: /tmp/iivo-glass-overnight/<CATEGORY>_AI_ANSWERS.md (+ console summary)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getScenarioById } from "./qa-scenarios/iivo-glass-scenarios.mjs";
import { answerSimilarity } from "./lib/glass-answer-quality.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = "/tmp/iivo-glass-overnight";
const RESULTS_JSONL = join(OUT, "live-scenario-results.jsonl");
const GRADED = new Set(["video_learning", "creator_content", "sales_review"]);

function parseArgs() {
  const i = process.argv.indexOf("--run-since");
  return i >= 0 ? process.argv[i + 1] : null;
}

function loadJsonl() {
  if (!existsSync(RESULTS_JSONL)) return [];
  return readFileSync(RESULTS_JSONL, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function mdEscape(text) {
  return String(text ?? "").replace(/\|/g, "\\|").replace(/\r/g, "").trim();
}

function main() {
  const runSince = parseArgs();
  const all = loadJsonl();
  const records = all
    .filter((r) => GRADED.has(r.category) && r.pass && r.categoryVerdict)
    .filter((r) => (runSince ? r.finishedAt >= runSince : true));

  if (records.length === 0) {
    console.error("No graded category records found in window.");
    process.exit(1);
  }

  const byCategory = new Map();
  for (const r of records) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category).push(r);
  }

  let anyFailure = false;

  for (const [category, rows] of byCategory) {
    const lines = [];
    lines.push(`# IIVO Glass — ${category} answer audit`);
    lines.push("");
    lines.push(`Records: **${rows.length}**${runSince ? ` since \`${runSince}\`` : ""}.`);
    lines.push("");
    lines.push("> Excluded: secrets, base64/screenshots, raw private session payloads.");
    lines.push("");

    const verdicts = { strong: 0, acceptable: 0, weak: 0 };
    let genericCount = 0;

    const maxSim = rows.map((r, idx) => {
      let best = 0;
      let bestId = null;
      for (let j = 0; j < rows.length; j++) {
        if (j === idx) continue;
        const sim = answerSimilarity(
          r.answerPreview ?? r.shortAnswer,
          rows[j].answerPreview ?? rows[j].shortAnswer,
        );
        if (sim > best) {
          best = sim;
          bestId = rows[j].scenarioId;
        }
      }
      return { best, bestId };
    });

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const scenario = getScenarioById(r.scenarioId);
      verdicts[r.categoryVerdict] = (verdicts[r.categoryVerdict] ?? 0) + 1;
      if (r.categoryGeneric) genericCount += 1;

      lines.push(`## ${r.scenarioId}`);
      lines.push("");
      lines.push("| Field | Value |");
      lines.push("|-------|-------|");
      lines.push(`| Title | ${mdEscape(scenario?.title ?? "?")} |`);
      lines.push(`| routeUsed | ${r.routeUsed ?? "—"} |`);
      lines.push(`| modelUsed | ${r.modelUsed ?? r.model ?? "—"} |`);
      lines.push(`| latency | ${r.latencyMs}ms |`);
      lines.push(`| verdict | **${r.categoryVerdict}** |`);
      lines.push(`| thin context | ${r.categoryThin ? "yes" : "no"} |`);
      lines.push(`| generic/template flag | ${r.categoryGeneric ? "YES" : "no"} |`);
      lines.push(`| missing called out | ${r.categoryMissingCalledOut ? "yes" : "no"} |`);
      lines.push(`| anchors mentioned | ${(r.categoryMentionedAnchors ?? []).join(", ") || "none"} |`);
      lines.push(`| expected missing | ${(r.categoryMissingFields ?? []).join(", ") || "none"} |`);
      lines.push(
        `| max template similarity | ${maxSim[i].best.toFixed(2)}${maxSim[i].bestId ? ` (vs ${maxSim[i].bestId})` : ""} |`,
      );
      lines.push("");
      lines.push("**Prompt:**");
      lines.push("```");
      lines.push(r.promptPreview ?? scenario?.userPrompt ?? "?");
      lines.push("```");
      lines.push("");
      lines.push("**Injected context:**");
      lines.push("");
      lines.push(mdEscape(r.contextSummary ?? "?"));
      lines.push("");
      lines.push("**Answer preview:**");
      lines.push("```");
      lines.push(r.answerPreview || r.shortAnswer || "(missing)");
      lines.push("```");
      lines.push("");
    }

    const total = rows.length;
    const strongPct = Math.round((verdicts.strong / total) * 100);
    const maxOverlap = maxSim.reduce((mx, s) => Math.max(mx, s.best), 0);
    lines.unshift(
      "",
      `**Verdicts:** strong=${verdicts.strong} (${strongPct}%) · acceptable=${verdicts.acceptable} · weak=${verdicts.weak} · generic flags=${genericCount} · max similarity=${maxOverlap.toFixed(2)}`,
    );

    const report = join(OUT, `${category.toUpperCase()}_AI_ANSWERS.md`);
    writeFileSync(report, lines.join("\n"));

    console.log(`\n=== ${category} answer audit ===`);
    console.log(`Answers: ${total}`);
    console.log(
      `strong=${verdicts.strong} (${strongPct}%) acceptable=${verdicts.acceptable} weak=${verdicts.weak} generic=${genericCount}`,
    );
    console.log(`max pairwise template similarity=${maxOverlap.toFixed(2)}`);
    console.log(`Wrote ${report}`);

    const failures = [];
    if (verdicts.weak > 0) failures.push(`${verdicts.weak} weak`);
    if (total >= 5 && strongPct < 80) failures.push(`only ${strongPct}% strong (<80%)`);
    if (maxOverlap >= 0.7) failures.push(`template similarity too high (${maxOverlap.toFixed(2)})`);
    if (failures.length) {
      console.error(`${category} QUALITY BAR NOT MET: ${failures.join("; ")}`);
      anyFailure = true;
    } else {
      console.log(`${category} quality bar met.`);
    }
  }

  if (anyFailure) process.exit(1);
}

main();
