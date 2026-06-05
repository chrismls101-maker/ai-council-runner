import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const guardPath = join(__dirname, "..", "..", "scripts", "glass-git-guard.mjs");

test("git guard script classifies blocked paths", () => {
  const script = readFileSync(guardPath, "utf8");
  assert.ok(script.includes("classifyGitPath"));
  assert.ok(script.includes("release"));
  assert.ok(script.includes("--working-tree"));
});

test("git guard blocked path patterns cover release and dmg", () => {
  const blocked = [
    "desktop-glass/release/IIVO Glass.app",
    "dist/package.dmg",
    "data/session-data/foo.json",
  ];
  for (const path of blocked) {
    assert.ok(/release|\.dmg|session[-_]?data/i.test(path), path);
  }
});

test("allowed source paths are not release artifacts", () => {
  const allowed = "src/shared/copilotSessionType.ts";
  assert.ok(!/\/release\//.test(allowed));
  assert.ok(!/\.dmg$/.test(allowed));
});
