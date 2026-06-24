#!/usr/bin/env node
/**
 * Print Glass branch context and WIP integration reminders.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glassRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(glassRoot, "..");

const STABLE_BRANCH = "cleanup/focused-iivo-lens-core";
const WIP_BRANCH = "wip/glass-splash-dock-audio-panel";

function git(args, cwd = repoRoot) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
const dirty = git(["status", "--porcelain"]).stdout.trim();
const onStable = branch === STABLE_BRANCH;
const onWip = branch.startsWith("wip/");

console.log("[glass-wip-status]");
console.log(`  current branch: ${branch}`);
console.log(`  stable branch:  ${STABLE_BRANCH}`);
console.log(`  wip branch:     ${WIP_BRANCH}`);
console.log(`  working tree:   ${dirty ? "dirty" : "clean"}`);

if (onWip) {
  console.log("\n  ⚠ You are on a WIP branch. Do NOT merge directly into stable.");
  console.log("  See desktop-glass/WIP_INTEGRATION_PLAN.md for safe integration.");
} else if (onStable) {
  console.log("\n  ✓ Stable core branch. Stage files explicitly — never git add .");
} else {
  console.log("\n  ℹ Feature branch — confirm this is intentional before merging to stable.");
}

console.log("\n  Recommended WIP integration:");
console.log(`    git switch ${STABLE_BRANCH}`);
console.log(`    git switch -c integrate/glass-<category>`);
console.log(`    git cherry-pick <commit-from-${WIP_BRANCH}>`);
console.log("    npm run glass:validate:clean -- --strict");
