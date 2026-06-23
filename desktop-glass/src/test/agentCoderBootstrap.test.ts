import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  buildCoderBootstrapContext,
  buildProjectFileIndex,
  formatProjectFileIndex,
  readGlassContext,
} from "../main/agentCoderBootstrap.ts";

test("buildProjectFileIndex lists project files and skips node_modules", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "glass-coder-index-"));
  try {
    await mkdir(path.join(root, "src"), { recursive: true });
    await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
    await writeFile(path.join(root, "src", "index.ts"), "export {};\n", "utf-8");
    await writeFile(path.join(root, "node_modules", "pkg", "index.js"), "", "utf-8");
    await writeFile(path.join(root, "README.md"), "# hi\n", "utf-8");

    const index = await buildProjectFileIndex(root);
    assert.ok(index.paths.includes("README.md"));
    assert.ok(index.paths.includes("src/index.ts"));
    assert.equal(index.paths.some((p) => p.includes("node_modules")), false);

    const formatted = formatProjectFileIndex(index);
    assert.match(formatted, /Project file index/);
    assert.match(formatted, /src\/index\.ts/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readGlassContext returns null when file missing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "glass-context-miss-"));
  try {
    assert.equal(await readGlassContext(root), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readGlassContext truncates at 12K chars", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "glass-context-trunc-"));
  try {
    await writeFile(path.join(root, "GLASS_CONTEXT.md"), "x".repeat(13_000), "utf-8");
    const content = await readGlassContext(root);
    assert.ok(content);
    assert.ok(content.length < 13_000);
    assert.match(content, /truncated at 12K chars/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("buildCoderBootstrapContext prepends GLASS_CONTEXT before other sections", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "glass-context-bootstrap-"));
  try {
    await writeFile(path.join(root, "GLASS_CONTEXT.md"), "# Project memory\nStack: TS\n", "utf-8");
    const ctx = await buildCoderBootstrapContext({
      projectRoot: root,
      includeFileWalk: true,
    });
    assert.ok(ctx);
    assert.match(ctx, /^\[GLASS_CONTEXT\.md — Project memory/);
    assert.ok(ctx.indexOf("# Project memory") < ctx.indexOf("Project file index"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
