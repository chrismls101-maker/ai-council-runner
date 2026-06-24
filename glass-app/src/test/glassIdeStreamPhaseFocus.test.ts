import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveGlassIdeActiveFocus, deriveGlassIdeChangesetSummary } from "../shared/glassIdeActiveFocus.ts";
import { injectTranscriptPhaseMarkers } from "../shared/glassIdeTranscriptPhaseDividers.ts";
import type { CoderTranscriptCollapsedDisplayItem } from "../shared/glassIdeTranscriptCollapse.ts";

test("injectTranscriptPhaseMarkers inserts dividers when phase changes", () => {
  const items: CoderTranscriptCollapsedDisplayItem[] = [
    {
      kind: "inspect-cluster",
      id: "c1",
      count: 2,
      labels: ["Read a.ts", "Read b.ts"],
      tools: [],
    },
    {
      kind: "tool",
      id: "t1",
      toolUseId: "tu-1",
      toolName: "edit_file",
      label: "Edit auth.ts",
      status: "running",
      relativePath: "src/auth.ts",
    },
    {
      kind: "tool",
      id: "t2",
      toolUseId: "tu-2",
      toolName: "run_project_command",
      label: "npm test",
      status: "running",
      command: "npm test",
    },
  ];

  const stream = injectTranscriptPhaseMarkers(items, {
    pendingApproval: null,
    activeRunId: "run-1",
  });

  assert.equal(stream.filter((item) => item.kind === "phase-marker").length, 3);
  assert.equal(stream[0].kind, "phase-marker");
  assert.equal(stream[0].kind === "phase-marker" ? stream[0].phase : null, "inspect");
  assert.equal(stream[2].kind === "phase-marker" ? stream[2].phase : null, "edit");
  assert.equal(stream[4].kind === "phase-marker" ? stream[4].phase : null, "verify");
});

test("injectTranscriptPhaseMarkers uses apply phase when approval pending", () => {
  const items: CoderTranscriptCollapsedDisplayItem[] = [
    {
      kind: "tool",
      id: "t1",
      toolUseId: "tu-1",
      toolName: "edit_file",
      label: "Edit auth.ts",
      status: "running",
      relativePath: "src/auth.ts",
    },
  ];

  const stream = injectTranscriptPhaseMarkers(items, {
    pendingApproval: {
      agentId: "coder",
      runId: "run-1",
      pendingToolId: "tu-1",
      pendingToolName: "edit_file",
      relativePath: "src/auth.ts",
      filePath: "/proj/src/auth.ts",
      description: "Add auth",
      displayLines: [],
      diff: { lines: [], added: 1, removed: 0, unchanged: false },
      contentHash: "x",
      proposedContent: "",
      fileExisted: true,
    },
    activeRunId: "run-1",
  });

  const marker = stream.find((item) => item.kind === "phase-marker");
  assert.equal(marker && marker.kind === "phase-marker" ? marker.phase : null, "apply");
});

test("deriveGlassIdeActiveFocus prioritizes pending approval", () => {
  const focus = deriveGlassIdeActiveFocus({
    displayItems: [],
    state: {
      agentRun: { runId: "run-1", agentId: "coder", status: "running", updatedAt: Date.now() },
      agentPendingApproval: {
        agentId: "coder",
        runId: "run-1",
        pendingToolId: "tu-1",
        pendingToolName: "edit_file",
        relativePath: "src/auth.ts",
        filePath: "/proj/src/auth.ts",
        description: "Add middleware",
        displayLines: [],
        diff: { lines: [], added: 2, removed: 0, unchanged: false },
        contentHash: "x",
        proposedContent: "",
        fileExisted: true,
      },
      coderRunUsage: {
        runId: "run-1",
        inputTokens: 1000,
        outputTokens: 200,
        estimatedUsd: 0.01,
        modelId: "sonnet",
        apiModel: "claude-sonnet-4-20250514",
        label: "Sonnet",
        updatedAt: Date.now(),
      },
    },
    runId: "run-1",
    agentRunning: true,
  });

  assert.equal(focus.visible, true);
  assert.equal(focus.tone, "pending");
  assert.equal(focus.title, "src/auth.ts");
  assert.match(focus.usageLine ?? "", /1\.0k in/);
});

test("deriveGlassIdeChangesetSummary aggregates file stats", () => {
  const summary = deriveGlassIdeChangesetSummary({
    touchedFiles: [
      { relativePath: "a.ts", fileName: "a.ts", added: 2, removed: 1, status: "applied" },
      { relativePath: "b.ts", fileName: "b.ts", added: 1, removed: 0, status: "pending" },
    ],
  });

  assert.equal(summary.visible, true);
  assert.match(summary.headline, /2 files/);
  assert.match(summary.headline, /1 pending/);
  assert.match(summary.detail ?? "", /\+3/);
});
