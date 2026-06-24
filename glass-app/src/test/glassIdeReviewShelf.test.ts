import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveGlassIdeReviewShelf } from "../shared/glassIdeReviewShelf.ts";
import { deriveGlassIdeRunHeader } from "../shared/glassIdeRunHeader.ts";
import { deriveCoderRunPhase } from "../shared/glassIdeRunPhase.ts";
import type { CoderTranscriptItem } from "../shared/glassIdeCoderTranscript.ts";
import type { GlassState } from "../shared/ipc.ts";

function baseState(overrides: Partial<GlassState> = {}): GlassState {
  return {
    agentRun: {
      runId: "run-1",
      agentId: "coder",
      status: "running",
      updatedAt: Date.now(),
      prompt: "Add auth middleware",
    },
    agentPendingApproval: null,
    agentChangeLog: [],
    coderVerifyState: null,
    qaPipelineState: null,
    glassSettings: { coderAgentModel: "sonnet" },
    agentHistory: [{ runId: "run-1", agentId: "coder", prompt: "Add auth", startedAt: Date.now() - 12_000, status: "running" }],
    ...overrides,
  } as GlassState;
}

test("deriveGlassIdeReviewShelf lists touched write tools and pending approval", () => {
  const transcript: CoderTranscriptItem[] = [
    {
      kind: "tool",
      id: "t1",
      toolUseId: "tu-1",
      toolName: "edit_file",
      label: "Edit auth.ts",
      status: "done",
      relativePath: "src/auth.ts",
      diff: { lines: [], added: 3, removed: 1, unchanged: false },
    },
  ];

  const shelf = deriveGlassIdeReviewShelf({
    transcript,
    state: baseState({
      agentPendingApproval: {
        agentId: "coder",
        runId: "run-1",
        pendingToolId: "tu-2",
        pendingToolName: "edit_file",
        relativePath: "src/middleware.ts",
        filePath: "/proj/src/middleware.ts",
        description: "Add middleware",
        displayLines: [],
        diff: { lines: [], added: 5, removed: 0, unchanged: false },
        contentHash: "x",
        proposedContent: "",
        fileExisted: true,
      },
    }),
    runId: "run-1",
  });

  assert.equal(shelf.visible, true);
  assert.equal(shelf.touchedFiles.length, 2);
  assert.equal(shelf.pendingCount, 1);
  assert.equal(shelf.openNextPath, "src/middleware.ts");
  assert.match(shelf.summaryLine, /2 files touched/);
});

test("deriveGlassIdeRunHeader shows model, phase, elapsed, and stop", () => {
  const header = deriveGlassIdeRunHeader({
    state: baseState(),
    runId: "run-1",
    taskPrompt: "Add auth middleware",
    transcript: [],
    nowMs: Date.now(),
  });

  assert.equal(header.visible, true);
  assert.equal(header.modelLabel, "Sonnet");
  assert.equal(header.phase, "inspect");
  assert.equal(header.showStop, true);
  assert.ok(header.elapsedLabel);
  assert.match(header.statusLabel, /Running/);
  assert.equal(header.touchedFiles.length, 0);
  assert.equal(header.runStatsLine, null);
});

test("deriveGlassIdeRunHeader merges review shelf into run chrome", () => {
  const transcript: CoderTranscriptItem[] = [
    {
      kind: "tool",
      id: "t1",
      toolUseId: "tu-1",
      toolName: "edit_file",
      label: "Edit auth.ts",
      status: "done",
      relativePath: "src/auth.ts",
      diff: { lines: [], added: 3, removed: 1, unchanged: false },
    },
  ];

  const header = deriveGlassIdeRunHeader({
    state: baseState(),
    runId: "run-1",
    taskPrompt: "Add auth middleware",
    transcript,
    nowMs: Date.now(),
  });

  assert.equal(header.touchedFiles.length, 1);
  assert.match(header.runStatsLine ?? "", /1 file touched/);
  assert.equal(header.openNextPath, null);
});

test("deriveCoderRunPhase returns apply when approval pending", () => {
  const phase = deriveCoderRunPhase({
    agentRunning: true,
    agentDone: false,
    agentFailed: false,
    approvalPending: true,
    transcript: [],
  });
  assert.equal(phase, "apply");
});

test("deriveCoderRunPhase returns verify when post-run verify running", () => {
  const phase = deriveCoderRunPhase({
    agentRunning: false,
    agentDone: true,
    agentFailed: false,
    approvalPending: false,
    verifyStatus: "running",
    transcript: [],
  });
  assert.equal(phase, "verify");
});
