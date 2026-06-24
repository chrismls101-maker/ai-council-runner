#!/usr/bin/env node
/**
 * Run Glass LIVE UI E2E — real IIVO server, not the stub.
 *
 * Prerequisites:
 *   npm run dev          # in another terminal
 *   npm run glass:build
 *
 * Usage:
 *   npm run glass:e2e:live
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glassRoot = path.resolve(__dirname, "..");

const apiUrl = (process.env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const webUrl = (process.env.IIVO_WEB_URL ?? "http://localhost:5173").replace(/\/$/, "");

try {
  const res = await fetch(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    console.error(`[glass-e2e-live] server not reachable at ${apiUrl} (HTTP ${res.status})`);
    console.error("Start IIVO first: npm run dev");
    process.exit(1);
  }
  const health = await res.json();
  if (!health.ok) {
    console.error("[glass-e2e-live] /api/health returned ok=false");
    process.exit(1);
  }
} catch (err) {
  console.error(`[glass-e2e-live] cannot reach ${apiUrl}/api/health`);
  console.error(err instanceof Error ? err.message : String(err));
  console.error("\nStart IIVO first: npm run dev\n");
  process.exit(1);
}

console.log(`[glass-e2e-live] server ok at ${apiUrl}\n`);

const build = spawnSync("npm", ["run", "build"], { cwd: glassRoot, stdio: "inherit", env: process.env });
if (build.status !== 0) process.exit(build.status ?? 1);

const env = {
  ...process.env,
  IIVO_GLASS_LIVE_E2E: "1",
  IIVO_GLASS_E2E: "1",
  IIVO_API_URL: apiUrl,
  IIVO_WEB_URL: webUrl,
};

const testRun = spawnSync(
  "npx",
  ["playwright", "test", "tests/e2e/glass-live.spec.ts", "-c", "playwright.electron.config.ts"],
  { cwd: glassRoot, stdio: "inherit", env },
);

process.exit(testRun.status ?? 1);
