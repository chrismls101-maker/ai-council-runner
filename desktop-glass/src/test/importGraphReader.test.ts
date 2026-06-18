/**
 * Tests for importGraphReader.ts (#164)
 *
 * Tests parseImports (pure, no I/O), resolveImportPath (filesystem), and
 * readImportGraph (integration). Filesystem tests use OS temp files.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  parseImports,
  resolveImportPath,
  readImportGraph,
  findProjectRoot,
  BUDGET_CHARS,
  FILE_MAX_CHARS,
} from "../main/importGraphReader.ts";

// ── parseImports ──────────────────────────────────────────────────────────────

describe("parseImports", () => {
  it("extracts ES module imports", () => {
    const src = `
import React from 'react';
import { useState } from 'react';
import Foo from './Foo';
import Bar from '../utils/Bar';
import './styles.css';
`;
    const result = parseImports(src, "/proj/src/App.tsx");
    assert.deepEqual(result.sort(), ["../utils/Bar", "./Foo", "./styles.css"].sort());
  });

  it("extracts re-exports", () => {
    const src = `
export { default } from './Component';
export * from './utils';
export { foo } from '../shared/foo';
`;
    const result = parseImports(src, "/proj/src/index.ts");
    assert.deepEqual(result.sort(), ["../shared/foo", "./Component", "./utils"].sort());
  });

  it("extracts dynamic imports", () => {
    const src = `const M = await import('./heavy');`;
    const result = parseImports(src, "/proj/src/app.ts");
    assert.deepEqual(result, ["./heavy"]);
  });

  it("extracts CommonJS require", () => {
    const src = `const foo = require('./foo');`;
    const result = parseImports(src, "/proj/src/app.js");
    assert.deepEqual(result, ["./foo"]);
  });

  it("ignores node_modules imports", () => {
    const src = `import express from 'express';`;
    const result = parseImports(src, "/proj/src/server.ts");
    assert.deepEqual(result, []);
  });

  it("ignores bare specifiers", () => {
    const src = `import path from 'node:path';`;
    const result = parseImports(src, "/proj/src/util.ts");
    assert.deepEqual(result, []);
  });

  it("deduplicates repeated imports", () => {
    const src = `
import A from './A';
import B from './A';
import C from './A';
`;
    const result = parseImports(src, "/proj/src/main.ts");
    assert.deepEqual(result, ["./A"]);
  });

  it("handles Python relative imports", () => {
    const src = `
from .utils import helper
from ..core import base
from ...top import thing
`;
    const result = parseImports(src, "/proj/src/module.py");
    assert.ok(result.includes("./utils"));
    assert.ok(result.includes("../core"));
    assert.ok(result.includes("../../top"));
  });

  it("returns empty array for empty file", () => {
    assert.deepEqual(parseImports("", "/proj/src/empty.ts"), []);
  });

  it("returns empty array for non-JS/TS/Python file", () => {
    const src = `import foo from './bar'`;
    // .go file — not supported
    assert.deepEqual(parseImports(src, "/proj/src/main.go"), []);
  });

  it("handles multiline import statements", () => {
    const src = `
import {
  alpha,
  beta,
} from './alpha-beta';
`;
    const result = parseImports(src, "/proj/src/App.tsx");
    assert.deepEqual(result, ["./alpha-beta"]);
  });

  it("handles mixed quotes", () => {
    const src = `
import A from "./A";
import B from './B';
`;
    const result = parseImports(src, "/proj/src/App.tsx");
    assert.deepEqual(result.sort(), ["./A", "./B"].sort());
  });
});

// ── resolveImportPath ─────────────────────────────────────────────────────────

describe("resolveImportPath", () => {
  let tmpDir: string;

  it("setup temp dir", async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "glass-import-test-"));
  });

  it("resolves exact path with extension", async () => {
    const file = path.join(tmpDir, "foo.ts");
    await fsp.writeFile(file, "export const x = 1;");
    const result = await resolveImportPath(tmpDir, "./foo.ts");
    assert.equal(result, file);
  });

  it("resolves path without extension (adds .ts)", async () => {
    const file = path.join(tmpDir, "bar.ts");
    await fsp.writeFile(file, "export const y = 2;");
    const result = await resolveImportPath(tmpDir, "./bar");
    assert.equal(result, file);
  });

  it("resolves path without extension — finds .tsx when .ts absent", async () => {
    const file = path.join(tmpDir, "Comp.tsx");
    await fsp.writeFile(file, "export const C = () => null;");
    const result = await resolveImportPath(tmpDir, "./Comp");
    assert.equal(result, file);
  });

  it("resolves directory import as index.ts", async () => {
    const dir = path.join(tmpDir, "myModule");
    await fsp.mkdir(dir, { recursive: true });
    const indexFile = path.join(dir, "index.ts");
    await fsp.writeFile(indexFile, "export const z = 3;");
    const result = await resolveImportPath(tmpDir, "./myModule");
    assert.equal(result, indexFile);
  });

  it("returns null for non-existent file", async () => {
    const result = await resolveImportPath(tmpDir, "./doesNotExist");
    assert.equal(result, null);
  });

  it("resolves parent directory traversal", async () => {
    const subDir = path.join(tmpDir, "sub");
    await fsp.mkdir(subDir, { recursive: true });
    const file = path.join(tmpDir, "shared.ts");
    await fsp.writeFile(file, "export const s = 4;");
    const result = await resolveImportPath(subDir, "../shared");
    assert.equal(result, file);
  });
});

// ── findProjectRoot ───────────────────────────────────────────────────────────

describe("findProjectRoot", () => {
  let tmpDir: string;

  it("setup", async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "glass-root-test-"));
  });

  it("returns startDir if no marker found", async () => {
    const subDir = path.join(tmpDir, "a", "b");
    await fsp.mkdir(subDir, { recursive: true });
    const result = await findProjectRoot(subDir);
    // Will walk up to home dir boundary, return startDir
    assert.ok(typeof result === "string");
  });

  it("finds package.json in parent", async () => {
    const projDir = path.join(tmpDir, "myproj");
    const srcDir = path.join(projDir, "src");
    await fsp.mkdir(srcDir, { recursive: true });
    await fsp.writeFile(path.join(projDir, "package.json"), "{}");
    const result = await findProjectRoot(srcDir);
    assert.equal(result, projDir);
  });

  it("finds tsconfig.json in parent", async () => {
    const projDir = path.join(tmpDir, "tsproject");
    const srcDir = path.join(projDir, "src", "components");
    await fsp.mkdir(srcDir, { recursive: true });
    await fsp.writeFile(path.join(projDir, "tsconfig.json"), "{}");
    const result = await findProjectRoot(srcDir);
    assert.equal(result, projDir);
  });
});

// ── readImportGraph ───────────────────────────────────────────────────────────

describe("readImportGraph", () => {
  let tmpDir: string;

  it("setup", async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "glass-graph-test-"));
  });

  it("returns empty array for file with no imports", async () => {
    const file = path.join(tmpDir, "noImports.ts");
    await fsp.writeFile(file, "export const x = 42;");
    const result = await readImportGraph(file, "export const x = 42;");
    assert.deepEqual(result, []);
  });

  it("returns depth-1 imports", async () => {
    const utilFile = path.join(tmpDir, "util.ts");
    await fsp.writeFile(utilFile, "export const add = (a: number, b: number) => a + b;");

    const mainFile = path.join(tmpDir, "main.ts");
    const mainContent = `import { add } from './util';`;
    await fsp.writeFile(mainFile, mainContent);

    const result = await readImportGraph(mainFile, mainContent);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.fileName, "util.ts");
    assert.equal(result[0]!.depth, 1);
    assert.ok(result[0]!.content.includes("add"));
  });

  it("returns depth-2 imports for close files", async () => {
    const coreFile = path.join(tmpDir, "core.ts");
    await fsp.writeFile(coreFile, "export const core = true;");

    const utilFile = path.join(tmpDir, "util2.ts");
    await fsp.writeFile(utilFile, `import { core } from './core';\nexport const util2 = true;`);

    const mainFile = path.join(tmpDir, "main2.ts");
    const mainContent = `import { util2 } from './util2';`;
    await fsp.writeFile(mainFile, mainContent);

    const result = await readImportGraph(mainFile, mainContent, { maxDepth: 2 });
    const names = result.map((r) => r.fileName).sort();
    assert.ok(names.includes("util2.ts"), "should include depth-1");
    assert.ok(names.includes("core.ts"), "should include depth-2");
    const d2 = result.find((r) => r.fileName === "core.ts");
    assert.equal(d2?.depth, 2);
  });

  it("respects maxDepth: 1 — does not follow depth-2", async () => {
    const deepFile = path.join(tmpDir, "deep.ts");
    await fsp.writeFile(deepFile, "export const deep = true;");

    const midFile = path.join(tmpDir, "mid.ts");
    await fsp.writeFile(midFile, `import { deep } from './deep';\nexport const mid = true;`);

    const topFile = path.join(tmpDir, "top.ts");
    const topContent = `import { mid } from './mid';`;
    await fsp.writeFile(topFile, topContent);

    const result = await readImportGraph(topFile, topContent, { maxDepth: 1 });
    const names = result.map((r) => r.fileName);
    assert.ok(names.includes("mid.ts"), "depth-1 included");
    assert.ok(!names.includes("deep.ts"), "depth-2 excluded when maxDepth=1");
  });

  it("deduplicates files imported by multiple paths", async () => {
    const shared = path.join(tmpDir, "shared.ts");
    await fsp.writeFile(shared, "export const sharedVal = 1;");

    const a = path.join(tmpDir, "a.ts");
    await fsp.writeFile(a, `import { sharedVal } from './shared';\nexport const A = true;`);

    const b = path.join(tmpDir, "b.ts");
    await fsp.writeFile(b, `import { sharedVal } from './shared';\nexport const B = true;`);

    const mainFile = path.join(tmpDir, "mainDedup.ts");
    const mainContent = `import { A } from './a';\nimport { B } from './b';`;
    await fsp.writeFile(mainFile, mainContent);

    const result = await readImportGraph(mainFile, mainContent);
    const sharedCount = result.filter((r) => r.fileName === "shared.ts").length;
    assert.equal(sharedCount, 1, "shared.ts should appear exactly once");
  });

  it("does not include node_modules imports", async () => {
    const mainFile = path.join(tmpDir, "mainNodeMod.ts");
    const mainContent = `import React from 'react';\nimport { useState } from 'react';`;
    await fsp.writeFile(mainFile, mainContent);
    const result = await readImportGraph(mainFile, mainContent);
    assert.deepEqual(result, []);
  });

  it("respects budget — stops when budget exhausted", async () => {
    // Create files that together exceed a tiny budget
    const a = path.join(tmpDir, "bigA.ts");
    await fsp.writeFile(a, "x".repeat(200));
    const b = path.join(tmpDir, "bigB.ts");
    await fsp.writeFile(b, "y".repeat(200));

    const mainFile = path.join(tmpDir, "mainBudget.ts");
    const mainContent = `import A from './bigA';\nimport B from './bigB';`;
    await fsp.writeFile(mainFile, mainContent);

    // Budget of 150 chars — only first file should fit
    const result = await readImportGraph(mainFile, mainContent, { budgetChars: 150 });
    assert.equal(result.length, 1);
  });

  it("skips test files", async () => {
    const testFile = path.join(tmpDir, "myUtil.test.ts");
    await fsp.writeFile(testFile, "import { x } from './foo';");

    const mainFile = path.join(tmpDir, "mainSkipTest.ts");
    const mainContent = `import './myUtil.test.ts'`;
    await fsp.writeFile(mainFile, mainContent);

    const result = await readImportGraph(mainFile, mainContent);
    assert.deepEqual(result, []);
  });

  it("skips CSS imports", async () => {
    const mainFile = path.join(tmpDir, "mainSkipCss.ts");
    const mainContent = `import './styles.css';`;
    await fsp.writeFile(mainFile, mainContent);
    const result = await readImportGraph(mainFile, mainContent);
    assert.deepEqual(result, []);
  });

  it("truncates files exceeding FILE_MAX_CHARS", async () => {
    const bigFile = path.join(tmpDir, "bigContent.ts");
    const bigContent = "export const x = " + "a".repeat(FILE_MAX_CHARS + 500) + ";";
    await fsp.writeFile(bigFile, bigContent);

    const mainFile = path.join(tmpDir, "mainTrunc.ts");
    const mainContent = `import { x } from './bigContent';`;
    await fsp.writeFile(mainFile, mainContent);

    const result = await readImportGraph(mainFile, mainContent);
    assert.equal(result.length, 1);
    assert.ok(result[0]!.content.includes("[truncated"), "content should be truncated");
    assert.ok(result[0]!.content.length <= FILE_MAX_CHARS + 100, "content length should be capped");
  });

  it("BUDGET_CHARS and FILE_MAX_CHARS are sensible values", () => {
    assert.ok(BUDGET_CHARS >= 8_000, "budget should be at least 8k chars");
    assert.ok(FILE_MAX_CHARS >= 2_000, "per-file cap should be at least 2k chars");
    assert.ok(FILE_MAX_CHARS <= BUDGET_CHARS, "per-file cap should not exceed total budget");
  });
});
