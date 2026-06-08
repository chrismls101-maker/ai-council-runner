#!/usr/bin/env node
/**
 * Build and deploy the IIVO server (Railway).
 *
 * Prerequisites:
 *   npx @railway/cli login
 *   npx @railway/cli link   # once, in this repo
 *
 * Set production env in Railway dashboard:
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, PERPLEXITY_API_KEY
 *   GLASS_API_SECRET (match IIVO_GLASS_API_SECRET in Glass builds)
 *   ALLOWED_ORIGIN=https://iivo.ai
 */
import { spawnSync } from "node:child_process";

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("Building IIVO server…");
run("npm", ["run", "build"]);

console.log("Linking Railway project (alluring-connection / iivo.ai)…");
run("npx", ["--yes", "@railway/cli", "link", "--project", "alluring-connection", "--environment", "production", "--service", "ai-council-runner"]);

console.log("Deploying to Railway…");
run("npx", ["--yes", "@railway/cli", "up", "--detach"]);

console.log("Done. Verify: curl https://iivo.ai/api/health");
