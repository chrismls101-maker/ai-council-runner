#!/usr/bin/env node
/**
 * Warn when Glass files look like release artifacts or session junk.
 *
 * Usage:
 *   node scripts/glass-git-guard.mjs
 *   node scripts/glass-git-guard.mjs --working-tree
 *   node scripts/glass-git-guard.mjs --working-tree --strict
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glassRoot = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const scanWorkingTree = args.includes("--working-tree");
const strict = args.includes("--strict");

const BLOCKED_PATH_RE =
  /(?:^|\/)(?:release|out|node_modules|test-results|playwright-report)(?:\/|$)/i;
const BLOCKED_EXT_RE = /\.(?:app|dmg|zip|blockmap)$/i;
const SESSION_ARTIFACT_RE =
  /(?:session[-_]?data|screenshots?\/|recordings?\/|\.session\.|glass-session)/i;
const HUGE_BINARY_RE = /\.(?:icns|wav|mp3|mp4|mov)$/i;
const ALLOWED_ASSET_PATH = /src\/renderer\/assets\//;

/** @param {string} file @param {"staged"|"working"} source */
export function classifyGitPath(file, source) {
  const issues = [];
  const warnings = [];
  if (BLOCKED_PATH_RE.test(file)) issues.push(`Blocked path (${source}): ${file}`);
  if (BLOCKED_EXT_RE.test(file)) issues.push(`Packaged artifact (${source}): ${file}`);
  if (SESSION_ARTIFACT_RE.test(file)) issues.push(`Session/screenshot artifact (${source}): ${file}`);
  if (HUGE_BINARY_RE.test(file) && !ALLOWED_ASSET_PATH.test(file)) {
    warnings.push(`Large binary (${source}, confirm intentional): ${file}`);
  }
  return { issues, warnings };
}

function gitLines(subcommand) {
  const result = spawnSync("git", subcommand, {
    cwd: glassRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function currentBranch() {
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: glassRoot,
    encoding: "utf8",
  });
  return result.stdout?.trim() ?? "unknown";
}

const staged = gitLines(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
const working = scanWorkingTree
  ? gitLines(["status", "--porcelain"]).map((line) => line.replace(/^\?\?\s+|^[ MADRCU?!]{2}\s+/u, "").trim())
  : [];

const errors = [];
const warnings = [];

for (const file of staged) {
  const { issues, warnings: w } = classifyGitPath(file, "staged");
  errors.push(...issues);
  warnings.push(...w);
}

if (scanWorkingTree) {
  for (const file of working) {
    const { issues, warnings: w } = classifyGitPath(file, "working");
    if (strict) errors.push(...issues);
    else warnings.push(...issues);
    warnings.push(...w);
  }
}

const branch = currentBranch();
if (branch.startsWith("wip/") && !branch.includes("integration")) {
  warnings.push(`On WIP branch '${branch}' — do not merge directly into stable. See WIP_INTEGRATION_PLAN.md.`);
}

if (warnings.length) {
  console.warn("[glass-git-guard] warnings:");
  for (const w of [...new Set(warnings)]) console.warn(`  - ${w}`);
}

if (errors.length) {
  console.error("[glass-git-guard] blocked files:");
  for (const e of [...new Set(errors)]) console.error(`  - ${e}`);
  console.error("\nUnstage or remove these before committing to the stable Glass branch.");
  process.exit(1);
}

const scope = scanWorkingTree ? "staged + working tree" : "staged";
if (staged.length === 0 && (!scanWorkingTree || working.length === 0)) {
  console.log(`[glass-git-guard] no files to scan (${scope}) — ok`);
} else {
  console.log(`[glass-git-guard] ${scope} scan passed (${staged.length} staged${scanWorkingTree ? `, ${working.length} working` : ""})`);
}
