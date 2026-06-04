#!/usr/bin/env node
/**
 * CI-friendly Glass E2E entrypoint.
 * Runs Electron E2E when a GUI display is available; otherwise exits 0 with a clear skip message.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glassRoot = path.resolve(__dirname, "..");

function hasGuiDisplay() {
  if (process.platform === "linux") return Boolean(process.env.DISPLAY?.trim());
  return true;
}

function skipReason() {
  if (process.env.GLASS_E2E_FORCE === "1") return null;
  if (!hasGuiDisplay()) {
    return (
      "Skipped because no GUI display is available. " +
      "Set GLASS_E2E_FORCE=1 only on a runner with display access."
    );
  }
  if ((process.env.CI === "true" || process.env.CI === "1") && process.env.GLASS_E2E_CI !== "1") {
    return (
      "Skipped in CI by default (standard runners lack GUI automation). " +
      "Set GLASS_E2E_CI=1 with xvfb on Linux, or GLASS_E2E_FORCE=1 on a macOS runner with display access."
    );
  }
  return null;
}

const reason = skipReason();
if (reason) {
  console.log(`[glass:e2e:ci] ${reason}`);
  process.exit(0);
}

const result = spawnSync("npm", ["run", "e2e"], {
  cwd: glassRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    GLASS_E2E_CI: "1",
  },
});

process.exit(result.status ?? 1);
