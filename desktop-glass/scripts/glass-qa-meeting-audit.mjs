#!/usr/bin/env node
/**
 * Focused meeting answer audit. Reads live-scenario-results.jsonl, filters
 * meeting_call records in the run window, and grades them: verdict, missing
 * fields, hallucinated owners, and pairwise template-similarity.
 *
 * Usage:
 *   node scripts/glass-qa-meeting-audit.mjs --run-since 2026-06-05T20:00:00.000Z
 *
 * Output: /tmp/iivo-glass-overnight/MEETING_AI_ANSWERS.md (+ console summary)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getScenarioById } from "./qa-scenarios/iivo-glass-scenarios.mjs";
import { answerSimilarity } from "./lib/glass-answer-quality.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = "/tmp/iivo-glass-overnight";
const RESULTS_JSONL = join(OUT, "live-scenario-results.jsonl");
const REPORT = join(OUT, "MEETING_AI_ANSWERS.md");

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
  const meeting = all
    .filter((r) => r.category === "meeting_call" && r.pass)
    .filter((r) => (runSince ? r.finishedAt >= runSince : true));

  const lines = [];
  lines.push("# IIVO Glass — Meeting Answer Audit");
  lines.push("");
  lines.push(`Records: **${meeting.length}** meeting answers${runSince ? ` since \`${runSince}\`` : ""}.`);
  lines.push("");
  lines.push("> Excluded: secrets, base64/screenshots, raw private session payloads.");
  lines.push("");

  const verdicts = { strong: 0, acceptable: 0, weak: 0, ungraded: 0 };
  let hallucinated = 0;

  // Pairwise template similarity (max overlap with any other meeting answer).
  const maxSim = meeting.map((r, idx) => {
    let best = 0;
    let bestId = null;
    for (let j = 0; j < meeting.length; j++) {
      if (j === idx) continue;
      const sim = answerSimilarity(r.answerPreview ?? r.shortAnswer, meeting[j].answerPreview ?? meeting[j].shortAnswer);
      if (sim > best) {
        best = sim;
        bestId = meeting[j].scenarioId;
      }
    }
    return { best, bestId };
  });

  for (let i = 0; i < meeting.length; i++) {
    const r = meeting[i];
    const scenario = getScenarioById(r.scenarioId);
    const v = r.meetingVerdict ?? "ungraded";
    verdicts[v] = (verdicts[v] ?? 0) + 1;
    if (r.meetingHallucinatedOwner) hallucinated += 1;

    lines.push(`## ${r.scenarioId}`);
    lines.push("");
    lines.push("| Field | Value |");
    lines.push("|-------|-------|");
    lines.push(`| Title | ${mdEscape(scenario?.title ?? "?")} |`);
    lines.push(`| routeUsed | ${r.routeUsed ?? "—"} |`);
    lines.push(`| modelUsed | ${r.modelUsed ?? r.model ?? "—"} |`);
    lines.push(`| latency | ${r.latencyMs}ms |`);
    lines.push(`| verdict | **${v}** |`);
    lines.push(`| missing fields | ${(r.meetingMissingFields ?? []).join(", ") || "none"} |`);
    lines.push(`| missing called out | ${r.meetingMissingCalledOut ? "yes" : "no"} |`);
    lines.push(`| hallucinated owner | ${r.meetingHallucinatedOwner ? "YES" : "no"} |`);
    lines.push(`| anchors mentioned | ${(r.meetingMentionedAnchors ?? []).join(", ") || "none"} |`);
    lines.push(`| max template similarity | ${maxSim[i].best.toFixed(2)}${maxSim[i].bestId ? ` (vs ${maxSim[i].bestId})` : ""} |`);
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

  const total = meeting.length || 1;
  const strongPct = Math.round((verdicts.strong / total) * 100);
  lines.unshift(
    "",
    `**Verdicts:** strong=${verdicts.strong} (${strongPct}%) · acceptable=${verdicts.acceptable} · weak=${verdicts.weak} · ungraded=${verdicts.ungraded} · hallucinated owners=${hallucinated}`,
  );

  writeFileSync(REPORT, lines.join("\n"));

  console.log("\n=== Meeting answer audit ===");
  console.log(`Meeting answers: ${meeting.length}`);
  console.log(
    `strong=${verdicts.strong} (${strongPct}%) acceptable=${verdicts.acceptable} weak=${verdicts.weak} ungraded=${verdicts.ungraded}`,
  );
  console.log(`hallucinated owners=${hallucinated}`);
  const maxOverlap = maxSim.reduce((mx, s) => Math.max(mx, s.best), 0);
  console.log(`max pairwise template similarity=${maxOverlap.toFixed(2)}`);
  console.log(`Wrote ${REPORT}`);

  // Quality bar: 0 weak, >=80% strong, no hallucinated owners.
  const failures = [];
  if (verdicts.weak > 0) failures.push(`${verdicts.weak} weak meeting answer(s)`);
  if (hallucinated > 0) failures.push(`${hallucinated} hallucinated owner(s)`);
  if (meeting.length >= 5 && strongPct < 80) failures.push(`only ${strongPct}% strong (<80%)`);
  if (failures.length) {
    console.error(`MEETING QUALITY BAR NOT MET: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("Meeting quality bar met.");
}

main();
