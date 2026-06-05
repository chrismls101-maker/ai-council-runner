#!/usr/bin/env node
/**
 * Warn when staged Glass files look like release artifacts or session junk.
 *
 * Usage: node scripts/glass-git-guard.mjs
 * Exit 0 = ok (warnings only), 1 = blocked patterns staged.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glassRoot = path.resolve(__dirname, "..");

const BLOCKED_PATH_RE =
  /(?:^|\/)(?:release|out|node_modules|test-results|playwright-report)(?:\/|$)/i;
const BLOCKED_EXT_RE = /\.(?:app|dmg|zip|blockmap|png\.screenshot)$/i;
const SESSION_ARTIFACT_RE =
  /(?:session[-_]?data|screenshots?\/|recordings?\/|\.session\.|glass-session)/i;
const HUGE_BINARY_RE = /\.(?:icns|wav|mp3|mp4|mov)$/i;

function stagedFiles() {
  const result = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
    cwd: glassRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const staged = stagedFiles();
const errors = [];
const warnings = [];

for (const file of staged) {
  if (BLOCKED_PATH_RE.test(file)) {
    errors.push(`Blocked path staged: ${file}`);
  }
  if (BLOCKED_EXT_RE.test(file)) {
    errors.push(`Packaged artifact staged: ${file}`);
  }
  if (SESSION_ARTIFACT_RE.test(file)) {
    errors.push(`Session/screenshot artifact staged: ${file}`);
  }
  if (HUGE_BINARY_RE.test(file) && !file.includes("src/renderer/assets/")) {
    warnings.push(`Large binary staged (confirm intentional): ${file}`);
  }
}

if (warnings.length) {
  console.warn("[glass-git-guard] warnings:");
  for (const w of warnings) console.warn(`  - ${w}`);
}

if (errors.length) {
  console.error("[glass-git-guard] blocked staged files:");
  for (const e of errors) console.error(`  - ${e}`);
  console.error("\nUnstage these before committing to the stable Glass branch.");
  process.exit(1);
}

if (staged.length === 0) {
  console.log("[glass-git-guard] no staged files (ok)");
} else {
  console.log(`[glass-git-guard] ${staged.length} staged file(s) look ok`);
}
