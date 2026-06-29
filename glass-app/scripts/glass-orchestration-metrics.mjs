#!/usr/bin/env node
/**
 * Query 7-day orchestration hardening metrics from local retention_events.
 *
 * Usage:
 *   node scripts/glass-orchestration-metrics.mjs
 *   node scripts/glass-orchestration-metrics.mjs --json
 *   node scripts/glass-orchestration-metrics.mjs --user-data "$HOME/Library/Application Support/IIVO Glass"
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import Database from "better-sqlite3";

const ORCHESTRATION_EVENTS = [
  "memory_fts_fallback_used",
  "design_repair_triggered",
  "audio_coder_auto_launch",
  "coder_launch_dedupe_suppressed",
];

function parseArgs(argv) {
  const out = {
    json: false,
    userData: join(homedir(), "Library", "Application Support", "IIVO Glass"),
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--json") out.json = true;
    else if (argv[i] === "--user-data" && argv[i + 1]) out.userData = argv[++i];
  }
  return out;
}

function countMetaField(rows, field, value) {
  return rows.filter((r) => {
    try {
      const m = r.meta ? JSON.parse(r.meta) : null;
      return m?.[field] === value;
    } catch {
      return false;
    }
  }).length;
}

function rollup(input) {
  const designRepairSuccessRate =
    input.designRepairTriggered > 0
      ? Math.round((input.designRepairSucceeded / input.designRepairTriggered) * 100) / 100
      : 0;
  return {
    memoryFtsFallbackLast7Days: input.memoryFtsFallback,
    designRepairTriggeredLast7Days: input.designRepairTriggered,
    designRepairSuccessRateLast7Days: designRepairSuccessRate,
    audioCoderAutoLaunchLast7Days: input.audioCoderAutoLaunch,
    audioCoderAutoLaunchWithoutWorkspaceLast7Days: input.audioCoderAutoLaunchWithoutWorkspace,
    coderLaunchDedupeSuppressedLast7Days: input.coderLaunchDedupeSuppressed,
  };
}

function main() {
  const { json, userData } = parseArgs(process.argv);
  const dbPath = join(userData, "session-history.db");
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  if (!existsSync(dbPath)) {
    const empty = { dbPath, dbExists: false, metrics: rollup({
      memoryFtsFallback: 0,
      designRepairTriggered: 0,
      designRepairSucceeded: 0,
      audioCoderAutoLaunch: 0,
      audioCoderAutoLaunchWithoutWorkspace: 0,
      coderLaunchDedupeSuppressed: 0,
    }), recentEvents: [] };
    if (json) console.log(JSON.stringify(empty, null, 2));
    else console.log(`No database at ${dbPath}`);
    return;
  }

  const db = new Database(dbPath, { readonly: true });

  const countEvent = (eventName) => {
    const row = db
      .prepare(
        "SELECT COUNT(*) AS n FROM retention_events WHERE event_name = ? AND created_at >= ?",
      )
      .get(eventName, cutoff);
    return Number(row?.n ?? 0);
  };

  const designRepairRows = db
    .prepare(
      "SELECT meta FROM retention_events WHERE event_name = 'design_repair_triggered' AND created_at >= ?",
    )
    .all(cutoff);

  const audioLaunchRows = db
    .prepare(
      "SELECT meta FROM retention_events WHERE event_name = 'audio_coder_auto_launch' AND created_at >= ?",
    )
    .all(cutoff);

  const metrics = rollup({
    memoryFtsFallback: countEvent("memory_fts_fallback_used"),
    designRepairTriggered: countEvent("design_repair_triggered"),
    designRepairSucceeded: countMetaField(designRepairRows, "success", true),
    audioCoderAutoLaunch: countEvent("audio_coder_auto_launch"),
    audioCoderAutoLaunchWithoutWorkspace: countMetaField(audioLaunchRows, "hadWorkspace", false),
    coderLaunchDedupeSuppressed: countEvent("coder_launch_dedupe_suppressed"),
  });

  const recentEvents = db
    .prepare(
      `SELECT event_name, created_at, meta FROM retention_events
       WHERE event_name IN (${ORCHESTRATION_EVENTS.map(() => "?").join(",")})
         AND created_at >= ?
       ORDER BY created_at DESC LIMIT 20`,
    )
    .all(...ORCHESTRATION_EVENTS, cutoff);

  const report = { dbPath, dbExists: true, metrics, recentEvents };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("Glass orchestration metrics (last 7 days)");
  console.log(`Database: ${dbPath}\n`);
  for (const [k, v] of Object.entries(metrics)) {
    console.log(`  ${k}: ${v}`);
  }
  if (recentEvents.length) {
    console.log("\nRecent orchestration events:");
    for (const row of recentEvents) {
      const when = new Date(row.created_at).toISOString();
      console.log(`  ${when}  ${row.event_name}  ${row.meta ?? ""}`);
    }
  } else {
    console.log("\nNo orchestration events logged yet.");
  }
}

main();
