import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyTranscriptCollapseRules,
  REASONING_COLLAPSE_MIN_CHARS,
  reasoningPreview,
} from "../shared/glassIdeTranscriptCollapse.ts";
import type { CoderTranscriptDisplayItem } from "../shared/glassIdeCoderTranscript.ts";

function inspectTool(id: string, label: string): CoderTranscriptDisplayItem {
  return {
    kind: "tool",
    id,
    toolUseId: id,
    toolName: "read_file",
    label,
    status: "done",
  };
}

test("reasoningPreview truncates long text", () => {
  const long = "a".repeat(200);
  const preview = reasoningPreview(long);
  assert.ok(preview.length < long.length);
  assert.match(preview, /…$/);
});

test("applyTranscriptCollapseRules clusters consecutive inspect tools", () => {
  const items: CoderTranscriptDisplayItem[] = [
    inspectTool("t1", "Read auth.ts"),
    inspectTool("t2", "Read utils.ts"),
    inspectTool("t3", "Read index.ts"),
  ];

  const out = applyTranscriptCollapseRules(items, { agentRunning: false });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "inspect-cluster");
  if (out[0].kind === "inspect-cluster") {
    assert.equal(out[0].count, 3);
    assert.equal(out[0].labels.length, 3);
  }
});

test("applyTranscriptCollapseRules keeps single inspect as compact pill", () => {
  const items: CoderTranscriptDisplayItem[] = [inspectTool("t1", "Read auth.ts")];
  const out = applyTranscriptCollapseRules(items, { agentRunning: false });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "tool");
  if (out[0].kind === "tool") {
    assert.equal(out[0].displayCompact, true);
  }
});

test("applyTranscriptCollapseRules does not cluster running inspect tool", () => {
  const items: CoderTranscriptDisplayItem[] = [
    inspectTool("t1", "Read auth.ts"),
    inspectTool("t2", "Read utils.ts"),
    {
      kind: "tool",
      id: "t3",
      toolUseId: "t3",
      toolName: "read_file",
      label: "Read live.ts",
      status: "running",
    },
  ];

  const out = applyTranscriptCollapseRules(items, { agentRunning: true });
  assert.equal(out.length, 2);
  assert.equal(out[0].kind, "inspect-cluster");
  assert.equal(out[1].kind, "tool");
  if (out[1].kind === "tool") {
    assert.equal(out[1].status, "running");
    assert.equal(out[1].displayCompact, undefined);
  }
});

test("applyTranscriptCollapseRules collapses long reasoning before evidence", () => {
  const reasoning = "x".repeat(REASONING_COLLAPSE_MIN_CHARS + 40);
  const items: CoderTranscriptDisplayItem[] = [
    { kind: "text", id: "txt-1", text: reasoning },
    inspectTool("t1", "Read auth.ts"),
  ];

  const out = applyTranscriptCollapseRules(items, { agentRunning: false });
  assert.equal(out[0].kind, "text-collapsed");
  if (out[0].kind === "text-collapsed") {
    assert.ok(out[0].preview.length < reasoning.length);
  }
});

test("applyTranscriptCollapseRules keeps active streaming text expanded", () => {
  const reasoning = "y".repeat(220);
  const items: CoderTranscriptDisplayItem[] = [
    { kind: "text", id: "txt-live", text: reasoning },
  ];

  const out = applyTranscriptCollapseRules(items, { agentRunning: true });
  assert.equal(out[0].kind, "text");
});

test("applyTranscriptCollapseRules compacts applied write tools", () => {
  const items: CoderTranscriptDisplayItem[] = [
    {
      kind: "tool",
      id: "w1",
      toolUseId: "w1",
      toolName: "edit_file",
      label: "Edit auth.ts",
      status: "done",
      relativePath: "src/auth.ts",
      diff: { lines: [], added: 2, removed: 1, unchanged: false },
    },
  ];

  const out = applyTranscriptCollapseRules(items, { agentRunning: false });
  assert.equal(out[0].kind, "tool");
  if (out[0].kind === "tool") {
    assert.equal(out[0].displayCompact, true);
  }
});
