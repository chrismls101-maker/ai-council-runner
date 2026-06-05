#!/usr/bin/env node
/**
 * Run core Glass validation and warn when the working tree is not release-clean.
 *
 * Usage:
 *   node scripts/glass-validate-clean.mjs
 *   node scripts/glass-validate-clean.mjs --strict   # exit 1 if tree is dirty
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glassRoot = path.resolve(__dirname, "..");
const strict = process.argv.includes("--strict");

function run(cmd, args, cwd = glassRoot) {
  console.log(`\n[glass-validate-clean] ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", env: process.env });
  return result.status ?? 1;
}

function dirtyFiles() {
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: glassRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const dirty = dirtyFiles();
if (dirty.length) {
  const msg = `[glass-validate-clean] working tree has ${dirty.length} uncommitted change(s).`;
  if (strict) {
    console.error(msg);
    console.error("Commit WIP to wip/* branch or stash before release validation.");
    for (const line of dirty.slice(0, 20)) console.error(`  ${line}`);
    process.exit(1);
  }
  console.warn(`${msg} Continuing (use --strict to fail).`);
} else {
  console.log("[glass-validate-clean] working tree is clean.");
}

const steps = [
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "test"]],
];

for (const [cmd, args] of steps) {
  const code = run(cmd, args);
  if (code !== 0) process.exit(code);
}

console.log("\n[glass-validate-clean] core validation passed.");
