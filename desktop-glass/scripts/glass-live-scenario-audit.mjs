#!/usr/bin/env node
// Build LIVE_AI_ANSWERS.md from Live-scenario logs + jsonl answer samples.
//
// Usage:
//   node scripts/glass-live-scenario-audit.mjs
//   node scripts/glass-live-scenario-audit.mjs --run-since 2026-06-05T18:55:00.000Z
//
// Output: /tmp/iivo-glass-overnight/LIVE_AI_ANSWERS.md

import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getScenarioById } from "./qa-scenarios/iivo-glass-scenarios.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = "/tmp/iivo-glass-overnight";
const LOGS = join(OUT, "logs");
const RUNNER_LOG = join(OUT, "runner.log");
const RESULTS_JSONL = join(OUT, "live-scenario-results.jsonl");

/** Overnight 6h run window (UTC) — used to classify stale metadata logs. */
const OVERNIGHT_START = "2026-06-05T09:57:12.000Z";
const OVERNIGHT_END = "2026-06-05T15:57:19.000Z";

const OK_RE =
  /^OK live scenario (\S+) \[([^\]]+)\] · (\S+)(?: · (\S+))? · (\d+)ms · category=(\S+)/;
const FAIL_RE = /^FAIL (\S+): (.+)/;
const FAIL_HTTP_RE = /^FAIL HTTP (\d+)/;

function parseArgs() {
  const i = process.argv.indexOf("--run-since");
  return i >= 0 ? process.argv[i + 1] : null;
}

function summarizeContext(scenario) {
  const parts = [];
  if (scenario.screenContextText) parts.push(scenario.screenContextText.slice(0, 160));
  if (scenario.transcriptChunks?.length) {
    parts.push(`transcript: ${scenario.transcriptChunks.join(" ").slice(0, 120)}`);
  }
  if (scenario.fixturePage) parts.push(`fixture: ${scenario.fixturePage}`);
  return parts.join(" · ") || "(none)";
}

function mdEscape(text) {
  return String(text ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r/g, "")
    .trim();
}

function loadJsonlResults() {
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
    .filter(Boolean);
}

function parseRunnerSessions() {
  if (!existsSync(RUNNER_LOG)) return [];
  const lines = readFileSync(RUNNER_LOG, "utf8").split("\n");
  /** @type {Array<{mode:string,start:string,end?:string,liveScenarioSteps:number}>} */
  const sessions = [];
  let current = null;
  for (const line of lines) {
    const start = line.match(/\[qa:(\w+) ([0-9T:.]+Z)\] IIVO Glass QA · mode=(\w+)/);
    if (start) {
      if (current) sessions.push(current);
      current = { mode: start[3], start: start[2], liveScenarioSteps: 0 };
      continue;
    }
    if (!current) continue;
    if (line.includes("▶ Live scenario ") && line.includes("[SIMULATED+live]")) {
      current.liveScenarioSteps += 1;
    }
    if (line.includes("▶ Live scenario ") && line.includes("[CONTROLLED VISUAL FIXTURE]")) {
      current.liveScenarioSteps += 1;
    }
    const shutdown = line.match(/\[qa:\w+ ([0-9T:.]+Z)\] shutdown \(done\)/);
    if (shutdown) {
      current.end = shutdown[1];
      sessions.push(current);
      current = null;
    }
  }
  if (current) sessions.push(current);
  return sessions;
}

function classifyLogRow(row, runSince) {
  const started = row.started;
  if (started) {
    if (started >= OVERNIGHT_START && started <= OVERNIGHT_END) {
      return "overnight-metadata";
    }
    if (runSince && started >= runSince) return "current-run-log";
    if (started > OVERNIGHT_END) return "current-run-log";
  }
  if (runSince && row.mtimeIso >= runSince) return "current-run-log";
  if (row.mtimeIso > OVERNIGHT_END) return "current-run-log";
  return "overnight-metadata";
}

function parseLogFile(fileName, content) {
  const idFromName = fileName.match(/Live-scenario-(.+?)-\[/)?.[1]?.replace(/-/g, "_");
  const kindFromName = fileName.includes("CONTROLLED-VISUAL")
    ? "controlled_visual_fixture"
    : fileName.includes("SIMULATED")
      ? "simulated"
      : null;

  const started = content.match(/# started: (.+)/)?.[1] ?? null;
  const mtimeIso = statSync(join(LOGS, fileName)).mtime.toISOString();
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  let status = "unknown";
  let scenarioId = idFromName;
  let testKind = kindFromName;
  let routeUsed = null;
  let model = null;
  let latencyMs = null;
  let category = null;
  let failReason = null;
  let answerLine = null;

  for (const line of lines) {
    if (line.startsWith("answer:")) {
      answerLine = line.slice("answer:".length).trim();
      continue;
    }
    const ok = line.match(OK_RE);
    if (ok) {
      status = "pass";
      scenarioId = ok[1];
      testKind = ok[2];
      routeUsed = ok[3];
      model = ok[4] && !/^\d+$/.test(ok[4]) ? ok[4] : null;
      latencyMs = Number(ok[4] && /^\d+$/.test(ok[4]) ? ok[4] : ok[5]);
      category = ok[6] ?? ok[5];
      continue;
    }
    const fail = line.match(FAIL_RE);
    if (fail) {
      status = "fail";
      scenarioId = fail[1];
      failReason = fail[2];
      continue;
    }
    const httpFail = line.match(FAIL_HTTP_RE);
    if (httpFail) {
      status = "fail";
      failReason = `HTTP ${httpFail[1]}`;
    }
  }

  return {
    logFile: join(LOGS, fileName),
    fileName,
    started,
    mtimeIso,
    scenarioId,
    testKind,
    routeUsed,
    model,
    latencyMs,
    category,
    status,
    failReason,
    answerLine,
  };
}

function main() {
  const runSinceArg = parseArgs();
  const jsonl = loadJsonlResults();
  const jsonlSince =
    runSinceArg ??
    (jsonl.length ? jsonl.reduce((min, r) => (r.finishedAt < min ? r.finishedAt : min), jsonl[0].finishedAt) : null);

  const logFiles = readdirSync(LOGS)
    .filter((f) => f.includes("Live-scenario"))
    .sort();

  const parsed = logFiles.map((f) => parseLogFile(f, readFileSync(join(LOGS, f), "utf8")));
  for (const row of parsed) {
    row.bucket = classifyLogRow(row, jsonlSince);
  }

  const sessions = parseRunnerSessions();
  const overnightSession = sessions.find((s) => s.mode === "overnight" && s.start.startsWith("2026-06-05T09:57"));
  const latestQuick = [...sessions].reverse().find((s) => s.mode === "quick");

  const currentJsonl = jsonlSince
    ? jsonl.filter((r) => r.finishedAt >= jsonlSince)
    : jsonl;
  const currentLogs = parsed.filter((r) => r.bucket === "current-run-log");
  const overnightLogs = parsed.filter((r) => r.bucket === "overnight-metadata");

  const overnightUnique = new Set(overnightLogs.map((r) => r.scenarioId).filter(Boolean));

  const lines = [];
  lines.push("# IIVO Glass — Live AI Answer Audit");
  lines.push("");
  lines.push("Separates **current-run answer records** (jsonl) from **stale overnight metadata-only logs**.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Total Live-scenario log files on disk | ${logFiles.length} |`);
  lines.push(`| Overnight metadata-only logs (6h run, no answers) | ${overnightLogs.length} |`);
  lines.push(`| Current-run log files (post-overnight / overwritten) | ${currentLogs.length} |`);
  lines.push(`| Unique scenarios in overnight logs | ${overnightUnique.size} |`);
  lines.push(`| **Answer records in jsonl (total)** | **${jsonl.length}** |`);
  lines.push(`| **Answer records in current audit window** | **${currentJsonl.length}** |`);
  const transientRecovered = currentJsonl.filter((r) => r.pass === true && r.transientRecovered === true);
  const hardFailures = currentJsonl.filter((r) => r.pass === false);
  const timeoutUnrecovered = hardFailures.filter(
    (r) =>
      r.timeoutUnrecovered === true ||
      /timeout|timed out|abort/i.test(String(r.failReason ?? "")),
  );
  lines.push(`| Hard failures (current window) | ${hardFailures.length} |`);
  lines.push(`| Transient recovered (retry succeeded) | ${transientRecovered.length} |`);
  lines.push(`| Timeout unrecovered | ${timeoutUnrecovered.length} |`);
  if (latestQuick) {
    lines.push(`| Latest quick QA session | ${latestQuick.start} → ${latestQuick.end ?? "?"} (${latestQuick.liveScenarioSteps} live-scenario steps) |`);
  }
  if (overnightSession) {
    lines.push(`| Overnight QA session | ${overnightSession.start} → ${overnightSession.end ?? "?"} (${overnightSession.liveScenarioSteps} live-scenario steps) |`);
  }
  lines.push("");
  lines.push("## Run separation");
  lines.push("");
  lines.push(
    "**Yes — stale logs are mixed in.** The audit directory is append-only across runs. The 6-hour overnight run wrote **74 live-scenario steps** into **76 log files** (25 unique scenario IDs rotated across cycles). Quick mode only runs **2 live scenarios** per pass, but those reuse low step indices and overwrite a few files; the other **~74 overnight logs remain on disk**.",
  );
  lines.push("");
  lines.push(
    "**Only `live-scenario-results.jsonl` holds captured answer text.** Overnight logs are metadata-only (route/latency/pass). Current audit window for jsonl" +
      (jsonlSince ? `: \`${jsonlSince}\` and later.` : ": all records."),
  );
  lines.push("");
  lines.push("> Excluded: secrets, API keys, base64/screenshots, raw private session payloads.");
  lines.push("");

  lines.push("## Current run — captured answers (jsonl)");
  lines.push("");
  if (currentJsonl.length === 0) {
    lines.push("**No answer records captured in jsonl for the current window.**");
    lines.push("");
  } else {
    lines.push(`**Exactly ${currentJsonl.length} answer preview(s) captured.**`);
    lines.push("");
    for (const sample of currentJsonl) {
      const scenario = getScenarioById(sample.scenarioId);
      lines.push(`### ${sample.scenarioId}`);
      lines.push("");
      lines.push("| Field | Value |");
      lines.push("|-------|-------|");
      lines.push(`| Category | \`${sample.category}\` |`);
      lines.push(`| Test kind | \`${sample.testKind}\` |`);
      lines.push(`| routeUsed | ${sample.routeUsed ?? "—"} |`);
      lines.push(`| model requested | ${sample.modelRequested ?? sample.model ?? "—"} |`);
      lines.push(`| model used | ${sample.modelUsed ?? sample.model ?? "—"} |`);
      lines.push(`| fallback used | ${sample.fallbackUsed ? "yes" : "no"} |`);
      lines.push(`| latency | ${sample.latencyMs}ms |`);
      lines.push(`| pass | ${sample.pass} |`);
      lines.push(`| capturedAt | ${sample.finishedAt} |`);
      lines.push("");
      lines.push("**Prompt:**");
      lines.push("```");
      lines.push(sample.promptPreview ?? scenario?.userPrompt ?? "?");
      lines.push("```");
      lines.push("");
      lines.push("**Context summary:**");
      lines.push("");
      lines.push(mdEscape(sample.contextSummary ?? (scenario ? summarizeContext(scenario) : "?")));
      lines.push("");
      lines.push("**Answer preview:**");
      lines.push("```");
      lines.push(sample.shortAnswer || sample.answerPreview || "(missing)");
      lines.push("```");
      if (sample.qualityFlags) {
        lines.push("");
        lines.push("**Quality flags:**");
        lines.push("");
        for (const [k, v] of Object.entries(sample.qualityFlags)) {
          lines.push(`- ${k}: ${v}`);
        }
      }
      lines.push("");
    }
  }

  lines.push("## Overnight run — metadata only (no answer text)");
  lines.push("");
  lines.push(
    `${overnightLogs.length} log files from the 6-hour run. Pass/fail and route/latency only — **0 answer texts captured** (runner did not save jsonl yet).`,
  );
  lines.push("");
  lines.push("| Unique scenario ID | Overnight log count |");
  lines.push("|--------------------|---------------------|");
  const counts = new Map();
  for (const r of overnightLogs) {
    if (!r.scenarioId) continue;
    counts.set(r.scenarioId, (counts.get(r.scenarioId) ?? 0) + 1);
  }
  for (const [id, n] of [...counts.entries()].sort()) {
    lines.push(`| ${id} | ${n} |`);
  }
  lines.push("");

  lines.push("## Current-run log files (if any, may overlap jsonl)");
  lines.push("");
  if (currentLogs.length === 0) {
    lines.push("None classified by timestamp (quick runs may have overwritten overnight files without `# started:` headers).");
  } else {
    lines.push("| Log | Scenario | Route | Model | Latency | Status |");
    lines.push("|-----|----------|-------|-------|---------|--------|");
    for (const row of currentLogs) {
      lines.push(
        `| ${row.fileName.replace(/^\d+-/, "").slice(0, 40)} | ${row.scenarioId} | ${row.routeUsed ?? "—"} | ${row.model ?? "—"} | ${row.latencyMs ?? "—"} | ${row.status} |`,
      );
    }
  }
  lines.push("");

  writeFileSync(join(OUT, "LIVE_AI_ANSWERS.md"), lines.join("\n"));
  console.log(
    `Wrote ${join(OUT, "LIVE_AI_ANSWERS.md")} — jsonl=${currentJsonl.length} answers, overnight logs=${overnightLogs.length}, current logs=${currentLogs.length}`,
  );
}

main();
