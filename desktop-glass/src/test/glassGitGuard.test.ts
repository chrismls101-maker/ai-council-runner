import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const guardUrl = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "glass-git-guard.mjs"),
).href;

const {
  classifyGitPath,
  classifyFileContent,
  classifyBinarySize,
  classifyWipPathPolicy,
  isBlockedEnvPath,
  isWipOnlyPath,
  isAllowlistedPath,
  loadAllowlist,
  CONTENT_BLOCK_PATTERNS,
  STABLE_BRANCH,
} = await import(guardUrl);

test("git guard classifies blocked release and session paths", () => {
  for (const file of [
    "desktop-glass/release/IIVO Glass.app/Contents/Info.plist",
    "dist/package.dmg",
    "data/glass-sessions.json",
    "userData/session-screenshots/foo.png",
  ]) {
    const { issues } = classifyGitPath(file, "staged");
    assert.ok(issues.length > 0, file);
  }
});

test("secret-like content fails content scan", () => {
  const { issues } = classifyFileContent("OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456", "secrets.txt");
  assert.ok(issues.some((i) => i.includes("openai-env-key")));
});

test("base64 screenshot content fails content scan", () => {
  const snippet = 'const img = "data:image/png;base64,iVBORw0KGgo=";';
  const { issues } = classifyFileContent(snippet, "leak.ts");
  assert.ok(issues.some((i) => i.includes("data-image")));
});

test(".env fails but .env.example passes path policy", () => {
  assert.equal(isBlockedEnvPath(".env"), true);
  assert.equal(isBlockedEnvPath(".env.local"), true);
  assert.equal(isBlockedEnvPath(".env.example"), false);
  const envIssue = classifyGitPath(".env", "staged").issues;
  assert.ok(envIssue.length > 0);
  const exampleIssue = classifyGitPath(".env.example", "staged").issues;
  assert.equal(exampleIssue.length, 0);
});

test("allowlisted icon path passes binary size policy", () => {
  const dir = mkdtempSync(join(tmpdir(), "glass-guard-"));
  const file = "build/icon.png";
  const abs = join(dir, "icon.png");
  writeFileSync(abs, Buffer.alloc(3 * 1024 * 1024));
  const allowlist = { paths: new Set(["build/icon.png"]), largeBinaries: new Set(["build/icon.png"]) };
  assert.ok(isAllowlistedPath("build/icon.png", allowlist));
  const { issues } = classifyBinarySize(file, abs, allowlist);
  assert.equal(issues.length, 0);
});

test("WIP-only splash path is flagged", () => {
  assert.ok(isWipOnlyPath("src/renderer/splash/Splash.tsx"));
  assert.ok(isWipOnlyPath("splash.html"));
  assert.ok(!isWipOnlyPath("src/renderer/panel/Panel.tsx"));
});

test("WIP path fails on stable branch policy but warns on wip branch", () => {
  const file = "src/renderer/splash/Splash.tsx";
  const stable = classifyWipPathPolicy(file, "staged", STABLE_BRANCH, true);
  assert.ok(stable.issues.length > 0);
  const wip = classifyWipPathPolicy(file, "staged", "wip/glass-splash-dock-audio-panel", true);
  assert.equal(wip.issues.length, 0);
  assert.ok(wip.warnings.length > 0);
});

test("content block patterns cover session artifact names", () => {
  const ids = new Set(CONTENT_BLOCK_PATTERNS.map((p) => p.id));
  assert.ok(ids.has("glass-sessions"));
  assert.ok(ids.has("session-screenshots"));
});

test("git guard script exports classifyGitPath and content scan", async () => {
  const mod = await import(guardUrl);
  assert.equal(typeof mod.classifyGitPath, "function");
  assert.equal(typeof mod.classifyFileContent, "function");
  assert.equal(typeof mod.loadAllowlist, "function");
});

test("loadAllowlist reads git-guard.allowlist.json", () => {
  const list = loadAllowlist();
  assert.ok(list.paths.has("build/icon.icns"));
});
