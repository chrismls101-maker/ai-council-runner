import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import {
  applyCoderTranscriptEvent,
  formatCoderToolLabel,
  parseCommandToolResult,
  mergeCoderTranscriptDisplayItems,
} from "../shared/glassIdeCoderTranscript.ts";
import { resolveProjectPath } from "../main/agentCoderTools.ts";

test("formatCoderToolLabel names tools clearly", () => {
  assert.equal(formatCoderToolLabel("create_file", { path: "/p/proof.ts" }), "Create proof.ts");
  assert.equal(formatCoderToolLabel("read_file", { path: "/p/src/auth.ts" }), "Read auth.ts");
});

test("applyCoderTranscriptEvent streams text and tool calls", () => {
  let n = 0;
  const nextId = (): string => `t-${++n}`;

  let items = applyCoderTranscriptEvent([], { kind: "narrate", text: "Glass Coder starting" }, nextId);
  items = applyCoderTranscriptEvent(items, { kind: "text-delta", text: "I'll " }, nextId);
  items = applyCoderTranscriptEvent(items, { kind: "text-delta", text: "create it." }, nextId);
  items = applyCoderTranscriptEvent(items, {
    kind: "tool-start",
    toolName: "create_file",
    toolInput: { path: "proof.ts" },
    pendingToolId: "tu-1",
  }, nextId);
  items = applyCoderTranscriptEvent(items, {
    kind: "tool-done",
    toolName: "create_file",
    pendingToolId: "tu-1",
    toolResult: "Created proof.ts",
  }, nextId);

  assert.equal(items.length, 3);
  assert.equal(items[0].kind, "status");
  if (items[0].kind === "status") assert.match(items[0].text, /starting/i);
  assert.equal(items[1].kind, "text");
  if (items[1].kind === "text") assert.equal(items[1].text, "I'll create it.");
  assert.equal(items[2].kind, "tool");
  if (items[2].kind === "tool") {
    assert.equal(items[2].status, "done");
    assert.equal(items[2].label, "Create proof.ts");
  }
});

test("applyCoderTranscriptEvent merges pendingApproval into write tool cards", () => {
  let n = 0;
  const nextId = (): string => `t-${++n}`;
  const displayLines = [{ op: "add" as const, text: "export const GLASS_PROOF = 42;" }];
  const approval = {
    filePath: "/proj/proof.ts",
    relativePath: "proof.ts",
    description: "Create proof.ts",
    displayLines,
    diff: { lines: displayLines, added: 1, removed: 0, unchanged: false },
    contentHash: "abc",
    proposedContent: "export const GLASS_PROOF = 42;",
    fileExisted: false,
  };

  let items = applyCoderTranscriptEvent([], {
    kind: "tool-start",
    toolName: "create_file",
    toolInput: { path: "proof.ts" },
    pendingToolId: "tu-1",
  }, nextId);
  items = applyCoderTranscriptEvent(items, {
    kind: "approval-required",
    pendingToolId: "tu-1",
    pendingToolName: "create_file",
    pendingApproval: approval,
  }, nextId);
  items = applyCoderTranscriptEvent(items, {
    kind: "tool-done",
    toolName: "create_file",
    pendingToolId: "tu-1",
    toolResult: "Created proof.ts",
    pendingApproval: approval,
  }, nextId);

  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "tool");
  if (items[0].kind === "tool") {
    assert.equal(items[0].relativePath, "proof.ts");
    assert.equal(items[0].languageLabel, "TypeScript");
    assert.equal(items[0].displayLines?.length, 1);
    assert.equal(items[0].diff?.added, 1);
    assert.equal(items[0].diff?.removed, 0);
    assert.equal(items[0].status, "done");
  }
});

test("applyCoderTranscriptEvent previews create_file diff on tool-start", () => {
  let n = 0;
  const nextId = (): string => `t-${++n}`;

  const items = applyCoderTranscriptEvent([], {
    kind: "tool-start",
    toolName: "create_file",
    toolInput: { path: "proof.ts", content: "export const GLASS_PROOF = 42;\n" },
    pendingToolId: "tu-1",
  }, nextId);

  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "tool");
  if (items[0].kind === "tool") {
    assert.equal(items[0].status, "running");
    assert.equal(items[0].diff?.added, 1);
    assert.equal(items[0].displayLines?.some((line) => line.op === "add"), true);
  }
});

test("resolveProjectPath resolves relative paths under project root", () => {
  const root = path.join(os.tmpdir(), "glass-proj");
  const resolved = resolveProjectPath("src/proof.ts", root);
  assert.equal(resolved, path.resolve(root, "src/proof.ts"));
});

test("parseCommandToolResult parses exit code and output", () => {
  const parsed = parseCommandToolResult("Exit 1\nline one\nline two");
  assert.equal(parsed.exitCode, 1);
  assert.match(parsed.commandOutputHead ?? "", /line one/);
});

test("applyCoderTranscriptEvent attaches command receipt on tool-done", () => {
  let n = 0;
  const nextId = (): string => `t-${++n}`;

  let items = applyCoderTranscriptEvent([], {
    kind: "tool-start",
    toolName: "run_project_command",
    toolInput: { command: "npm run typecheck" },
    pendingToolId: "tu-cmd",
  }, nextId);

  items = applyCoderTranscriptEvent(items, {
    kind: "tool-done",
    toolName: "run_project_command",
    pendingToolId: "tu-cmd",
    toolResult: "Exit 0\nok",
    commandReceipt: {
      command: "npm run typecheck",
      cwd: "/proj",
      exitCode: 0,
      durationMs: 1250,
      output: "ok",
    },
  }, nextId);

  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "tool");
  if (items[0].kind === "tool") {
    assert.equal(items[0].command, "npm run typecheck");
    assert.equal(items[0].exitCode, 0);
    assert.equal(items[0].durationMs, 1250);
    assert.equal(items[0].commandCwd, "/proj");
  }
});

test("mergeCoderTranscriptDisplayItems appends post-run verify card", () => {
  const merged = mergeCoderTranscriptDisplayItems([], {
    agentRun: { runId: "run-1", agentId: "coder", status: "done", updatedAt: Date.now() },
    coderVerifyState: {
      runId: "run-1",
      status: "pass",
      command: "npm run typecheck",
    },
    qaPipelineState: null,
    glassSettings: { qaModeEnabled: false },
  } as never, "run-1");

  assert.equal(merged.length, 1);
  assert.equal(merged[0].kind, "verify");
});
