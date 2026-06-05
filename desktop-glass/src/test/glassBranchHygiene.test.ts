import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const glassRoot = join(__dirname, "..", "..");

test("GLASS_BRANCH_HYGIENE documents stable vs WIP branches", () => {
  const doc = readFileSync(join(glassRoot, "GLASS_BRANCH_HYGIENE.md"), "utf8");
  assert.ok(doc.includes("cleanup/focused-iivo-lens-core"));
  assert.ok(doc.includes("wip/glass-splash-dock-audio-panel"));
  assert.ok(doc.includes("git add ."));
  assert.ok(doc.includes("glass:validate:clean"));
});

test("glass-git-guard script exists and checks blocked paths", () => {
  const script = readFileSync(join(glassRoot, "scripts", "glass-git-guard.mjs"), "utf8");
  assert.ok(script.includes("release"));
  assert.ok(script.includes("dmg"));
  assert.ok(script.includes("node_modules"));
});

test("glass-validate-clean script exists", () => {
  const script = readFileSync(join(glassRoot, "scripts", "glass-validate-clean.mjs"), "utf8");
  assert.ok(script.includes("--strict"));
  assert.ok(script.includes("typecheck"));
});
