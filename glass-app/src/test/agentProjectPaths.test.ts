import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  filterExistingRelPaths,
  isPathInsideProject,
  promptMentionsDetectedFile,
  resolveProjectFilePath,
  sanitizeAgentScreenContext,
} from "../shared/agentProjectPaths.ts";

test("isPathInsideProject accepts paths under root", () => {
  const root = "/Users/dev/project";
  assert.equal(isPathInsideProject("/Users/dev/project/src/a.ts", root), true);
  assert.equal(isPathInsideProject("/Users/dev/other/a.ts", root), false);
});

test("filterExistingRelPaths drops missing and out-of-root paths", () => {
  const root = mkdtempSync(join(tmpdir(), "glass-paths-"));
  const srcDir = join(root, "src");
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(join(srcDir, "a.ts"), "export {};\n", "utf-8");

  const filtered = filterExistingRelPaths(root, ["src/a.ts", "src/missing.ts", "../escape.ts"]);
  assert.deepEqual(filtered, ["src/a.ts"]);
});

test("sanitizeAgentScreenContext drops paths outside project", () => {
  const root = mkdtempSync(join(tmpdir(), "glass-screen-"));
  const file = join(root, "in.ts");
  writeFileSync(file, "x", "utf-8");

  const kept = sanitizeAgentScreenContext(
    { detectedFilePath: file, confidence: "high" },
    root,
  );
  assert.equal(kept?.detectedFilePath, file);

  const dropped = sanitizeAgentScreenContext(
    { detectedFilePath: "/tmp/outside.ts", confidence: "high" },
    root,
  );
  assert.equal(dropped?.detectedFilePath, undefined);
  assert.equal(dropped?.confidence, "low");
});

test("resolveProjectFilePath resolves relative paths against project root", () => {
  const root = mkdtempSync(join(tmpdir(), "glass-rel-"));
  const srcDir = join(root, "src");
  mkdirSync(srcDir, { recursive: true });
  const file = join(srcDir, "app.ts");
  writeFileSync(file, "export {};\n", "utf-8");

  const resolved = resolveProjectFilePath(root, "src/app.ts");
  assert.equal(resolved, file);

  assert.equal(resolveProjectFilePath(root, "../escape.ts"), null);
});

test("sanitizeAgentScreenContext passes through when project root unset", () => {
  const ctx = { detectedFilePath: "/tmp/outside.ts", confidence: "high" as const };
  assert.deepEqual(sanitizeAgentScreenContext(ctx, ""), ctx);
});

test("promptMentionsDetectedFile matches basename and full path", () => {
  assert.equal(promptMentionsDetectedFile("fix foo.ts in the handler", "/proj/src/foo.ts"), true);
  assert.equal(promptMentionsDetectedFile("refactor auth module", "/proj/src/foo.ts"), false);
});
