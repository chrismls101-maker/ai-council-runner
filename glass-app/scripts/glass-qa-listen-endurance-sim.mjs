#!/usr/bin/env node
/**
 * Fast Listen Mode endurance simulation — no real audio.
 *
 * Usage:
 *   npm run glass:qa:listen:endurance:sim -- --hours 6 --speed fast
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatEnduranceConfig,
  parseListenEnduranceCli,
  validateEnduranceConfig,
} from "../src/shared/listenEnduranceConfig.ts";
import { runListenEnduranceSim } from "../src/shared/listenEnduranceSim.ts";
import { serializeJsonlLine } from "../src/shared/listenJsonlWriter.ts";

const OUT_DIR = "/tmp/iivo-glass-listen-endurance-sim";
const argv = process.argv.slice(2);
const config = parseListenEnduranceCli(argv);

console.log(formatEnduranceConfig(config));
console.log("");

const validation = validateEnduranceConfig(config);
for (const w of validation.warnings) console.warn(`WARN: ${w}`);
if (!validation.ok) {
  for (const e of validation.errors) console.error(`BLOCKED: ${e}`);
  process.exit(1);
}

if (config.realAudioRequired) {
  console.error("BLOCKED: --real-audio-required is for live QA only, not simulation.");
  process.exit(1);
}

const result = runListenEnduranceSim(config);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "ENDURANCE_SIM_REPORT.md"), result.finalReport);
writeFileSync(
  join(OUT_DIR, "ENDURANCE_SIM_RESULTS.jsonl"),
  serializeJsonlLine({
    type: "endurance_sim_summary",
    at: new Date().toISOString(),
    simulatedOnly: true,
    ok: result.ok,
    failures: result.failures,
    warnings: result.warnings,
    stats: result.stats,
    checkpointCount: result.checkpoints.length,
  }),
);

console.log("══════════════════════════════════════════════════════════════");
console.log("  IIVO Glass Listen Endurance Simulation (NO REAL AUDIO)");
console.log("══════════════════════════════════════════════════════════════");
console.log(`  Status: ${result.ok ? "PASS" : "FAIL"}`);
console.log(`  Simulated hours: ${result.stats.simulatedHours}`);
console.log(`  Ticks: ${result.stats.ticks}`);
console.log(`  Chunks ingested: ${result.stats.chunksIngested}`);
console.log(`  Checkpoints: ${result.stats.checkpointsWritten}`);
console.log(`  Cards surfaced: ${result.stats.cardsSurfaced}`);
console.log(`  Max transcript chars: ${result.stats.maxRunningTranscriptChars}`);
console.log(`  Max session events: ${result.stats.maxSessionEvents}`);
console.log(`  GPT calls (simulated budget): ${result.stats.gptCalls}`);
console.log(`  Listening limit triggered: ${result.stats.listeningLimitTriggered}`);
console.log(`  Report: ${OUT_DIR}/ENDURANCE_SIM_REPORT.md`);
console.log("══════════════════════════════════════════════════════════════");

if (result.failures.length) {
  console.error("\nFailures:");
  for (const f of result.failures) console.error(`  - ${f}`);
}
if (result.warnings.length) {
  console.warn("\nWarnings:");
  for (const w of result.warnings) console.warn(`  - ${w}`);
}

process.exit(result.ok ? 0 : 1);
