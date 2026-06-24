#!/usr/bin/env node
/**
 * Listen Mode preflight — PASS / BLOCKED / WARN before overnight endurance.
 *
 * Usage:
 *   npm run glass:qa:listen:preflight
 *   npm run glass:qa:listen:preflight -- --minutes 360 --max-listening-minutes 0
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatPreflightReport,
  runListenPreflight,
} from "../src/shared/listenPreflight.ts";
import { OUT_DIR, resolveSessionsPath } from "./lib/glass-listen-live-lib.mjs";

const apiUrl = (process.env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const argv = process.argv.slice(2);

const result = await runListenPreflight({
  apiUrl,
  argv,
  outDir: OUT_DIR,
  sessionsPath: resolveSessionsPath(),
});

mkdirSync(OUT_DIR, { recursive: true });
const reportPath = join(OUT_DIR, "LISTEN_PREFLIGHT.md");
writeFileSync(reportPath, formatPreflightReport(result));

console.log(formatPreflightReport(result));
console.log("");
console.log(`Preflight: ${result.status}`);
console.log(`Written: ${reportPath}`);

process.exit(result.status === "BLOCKED" ? 1 : 0);
