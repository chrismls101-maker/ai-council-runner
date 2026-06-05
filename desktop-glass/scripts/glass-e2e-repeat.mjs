#!/usr/bin/env node
/**
 * Run Glass Playwright E2E N times locally to catch transient CDP/socket flakes.
 *
 * Usage:
 *   node scripts/glass-e2e-repeat.mjs
 *   node scripts/glass-e2e-repeat.mjs 5
 */
import { execSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glassRoot = path.resolve(__dirname, "..");
const CDP_PORT = 19222;
const runs = Math.max(1, Number.parseInt(process.argv[2] ?? "3", 10) || 3);
const COOLDOWN_MS = 1500;

function killStaleCdpPort(port = CDP_PORT) {
  try {
    const out = execSync(`lsof -ti tcp:${port}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!out) return;
    for (const pid of out.split("\n")) {
      const n = Number(pid);
      if (Number.isFinite(n) && n > 0) {
        try {
          process.kill(n, "SIGKILL");
        } catch {
          /* gone */
        }
      }
    }
  } catch {
    /* port free */
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let failures = 0;
for (let i = 1; i <= runs; i += 1) {
  if (i > 1) {
    killStaleCdpPort();
    await sleep(COOLDOWN_MS);
  } else {
    killStaleCdpPort();
  }

  console.log(`\n[glass-e2e-repeat] run ${i}/${runs}`);
  const result = spawnSync("npm", ["run", "e2e"], {
    cwd: glassRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    failures += 1;
    console.error(`[glass-e2e-repeat] run ${i} failed (exit ${result.status ?? "unknown"})`);
    console.error(
      "[glass-e2e-repeat] see playwright-report/ and test-results/ for traces; re-run single e2e for diagnostics",
    );
    killStaleCdpPort();
  }
}

console.log(`\n[glass-e2e-repeat] ${runs - failures}/${runs} passed`);
process.exit(failures > 0 ? 1 : 0);
