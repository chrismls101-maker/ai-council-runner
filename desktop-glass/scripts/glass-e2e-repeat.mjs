#!/usr/bin/env node
/**
 * Run Glass Playwright E2E N times locally to catch transient CDP/socket flakes.
 *
 * Usage:
 *   node scripts/glass-e2e-repeat.mjs
 *   node scripts/glass-e2e-repeat.mjs 5
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glassRoot = path.resolve(__dirname, "..");
const runs = Math.max(1, Number.parseInt(process.argv[2] ?? "3", 10) || 3);

let failures = 0;
for (let i = 1; i <= runs; i += 1) {
  console.log(`\n[glass-e2e-repeat] run ${i}/${runs}`);
  const result = spawnSync("npm", ["run", "e2e"], {
    cwd: glassRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    failures += 1;
    console.error(`[glass-e2e-repeat] run ${i} failed (exit ${result.status ?? "unknown"})`);
  }
}

console.log(`\n[glass-e2e-repeat] ${runs - failures}/${runs} passed`);
process.exit(failures > 0 ? 1 : 0);
