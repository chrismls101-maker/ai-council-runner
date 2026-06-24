import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildWriteToolStartPreview } from "../main/agentWriteToolPreview.ts";
import {
  applyCoderTranscriptEvent,
} from "../shared/glassIdeCoderTranscript.ts";
import {
  highlightLineToHtml,
  languageIdFromPath,
  tokenizeLine,
} from "../shared/glassIdeSyntax.ts";

test("languageIdFromPath maps TypeScript files", () => {
  assert.equal(languageIdFromPath("src/proof.ts"), "typescript");
  assert.equal(languageIdFromPath("App.tsx"), "typescript");
});

test("highlightLineToHtml colors keywords and strings", () => {
  const html = highlightLineToHtml('export const x = "hi";', "typescript");
  assert.match(html, /gide-syntax-kw/);
  assert.match(html, /gide-syntax-str/);
  assert.match(html, /export/);
});

test("tokenizeLine handles line comments", () => {
  const tokens = tokenizeLine("// todo", "typescript");
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].kind, "comment");
});

test("buildWriteToolStartPreview returns live edit diff on tool-start", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "glass-preview-"));
  const filePath = path.join(root, "proof.ts");
  fs.writeFileSync(filePath, "export const GLASS_PROOF = 1;\n", "utf8");

  const preview = await buildWriteToolStartPreview("edit_file", {
    path: "proof.ts",
    old_string: "export const GLASS_PROOF = 1;",
    new_string: "export const GLASS_PROOF = 42;",
    description: "Bump constant",
  }, root);

  assert.ok(preview);
  assert.equal(preview?.relativePath, "proof.ts");
  assert.ok((preview?.diff?.added ?? 0) >= 1);
  assert.ok((preview?.diff?.removed ?? 0) >= 1);
  assert.ok(preview?.displayLines?.some((line) => line.op === "add"));
  assert.ok(preview?.displayLines?.some((line) => line.op === "remove"));
});

test("applyCoderTranscriptEvent shows edit_file diff from tool-start pendingApproval", () => {
  let n = 0;
  const nextId = (): string => `t-${++n}`;
  const displayLines = [
    { op: "remove" as const, text: "export const GLASS_PROOF = 1;" },
    { op: "add" as const, text: "export const GLASS_PROOF = 42;" },
  ];
  const approval = {
    filePath: "/proj/proof.ts",
    relativePath: "proof.ts",
    description: "Bump constant",
    displayLines,
    diff: { lines: displayLines, added: 1, removed: 1, unchanged: false },
    contentHash: "abc",
    proposedContent: "export const GLASS_PROOF = 42;\n",
    fileExisted: true,
  };

  const items = applyCoderTranscriptEvent([], {
    kind: "tool-start",
    toolName: "edit_file",
    toolInput: {
      path: "proof.ts",
      old_string: "export const GLASS_PROOF = 1;",
      new_string: "export const GLASS_PROOF = 42;",
    },
    pendingToolId: "tu-edit",
    pendingApproval: approval,
  }, nextId);

  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "tool");
  if (items[0].kind === "tool") {
    assert.equal(items[0].status, "running");
    assert.equal(items[0].diff?.added, 1);
    assert.equal(items[0].diff?.removed, 1);
    assert.equal(items[0].displayLines?.length, 2);
  }
});
