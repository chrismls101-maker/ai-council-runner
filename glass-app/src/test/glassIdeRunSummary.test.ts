import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveGlassIdeCompletionCard,
  deriveGlassIdeTrustLedger,
  scanCoderRunActivity,
} from "../shared/glassIdeRunSummary.ts";
import type { CoderTranscriptItem } from "../shared/glassIdeCoderTranscript.ts";

function tool(
  id: string,
  toolName: string,
  status: "done" | "running" | "error",
  extra: Partial<Extract<CoderTranscriptItem, { kind: "tool" }>> = {},
): CoderTranscriptItem {
  return {
    kind: "tool",
    id,
    toolUseId: id,
    toolName,
    label: toolName,
    status,
    ...extra,
  };
}

test("scanCoderRunActivity counts reads, writes, and commands", () => {
  const transcript: CoderTranscriptItem[] = [
    tool("r1", "read_file", "done"),
    tool("r2", "read_file", "done"),
    tool("e1", "edit_file", "done", { relativePath: "src/a.ts" }),
    tool("c1", "run_project_command", "done"),
  ];

  const stats = scanCoderRunActivity(transcript, [], "run-1");
  assert.equal(stats.filesRead, 2);
  assert.equal(stats.filesChanged, 1);
  assert.equal(stats.commandsRun, 1);
});

test("deriveGlassIdeTrustLedger shows counters during active run", () => {
  const ledger = deriveGlassIdeTrustLedger({
    transcript: [tool("r1", "read_file", "done")],
    state: {
      agentRun: { runId: "run-1", agentId: "coder", status: "running", updatedAt: Date.now() },
      agentChangeLog: [],
      coderRunUsage: {
        runId: "run-1",
        modelId: "sonnet",
        apiModel: "claude-sonnet-4-6",
        label: "Sonnet",
        inputTokens: 1200,
        outputTokens: 400,
        estimatedUsd: 0.01,
        updatedAt: Date.now(),
      },
    } as never,
    runId: "run-1",
  });

  assert.equal(ledger.visible, true);
  assert.equal(ledger.counters.length, 1);
  assert.equal(ledger.counters[0].id, "read");
  assert.match(ledger.usageLine ?? "", /1\.2k in/);
});

test("deriveGlassIdeCompletionCard summarizes changed files with passing verify", () => {
  const card = deriveGlassIdeCompletionCard({
    transcript: [
      tool("e1", "edit_file", "done", { relativePath: "src/auth.ts" }),
      tool("e2", "edit_file", "done", { relativePath: "src/utils.ts" }),
    ],
    state: {
      agentRun: { runId: "run-1", agentId: "coder", status: "done", updatedAt: Date.now() },
      agentChangeLog: [],
      agentPendingApproval: null,
      coderVerifyState: { runId: "run-1", status: "pass", command: "npm run typecheck" },
      qaPipelineState: null,
      glassSettings: {},
      coderRunUsage: null,
      lastError: undefined,
    } as never,
    runId: "run-1",
  });

  assert.equal(card.visible, true);
  assert.equal(card.tone, "ok");
  assert.match(card.headline, /Changed 2 files/);
  assert.match(card.headline, /checks passed/);
  assert.match(card.nextStep ?? "", /Review diffs/);
});

test("deriveGlassIdeCompletionCard hidden while agent running", () => {
  const card = deriveGlassIdeCompletionCard({
    transcript: [tool("r1", "read_file", "done")],
    state: {
      agentRun: { runId: "run-1", agentId: "coder", status: "running", updatedAt: Date.now() },
      agentChangeLog: [],
      agentPendingApproval: null,
      coderVerifyState: null,
      qaPipelineState: null,
      glassSettings: {},
      coderRunUsage: null,
    } as never,
    runId: "run-1",
  });

  assert.equal(card.visible, false);
});

test("deriveGlassIdeCompletionCard reports failure with next step", () => {
  const card = deriveGlassIdeCompletionCard({
    transcript: [tool("r1", "read_file", "done")],
    state: {
      agentRun: { runId: "run-1", agentId: "coder", status: "error", updatedAt: Date.now() },
      agentChangeLog: [],
      agentPendingApproval: null,
      coderVerifyState: null,
      qaPipelineState: null,
      glassSettings: {},
      coderRunUsage: null,
      lastError: "API rate limit",
    } as never,
    runId: "run-1",
  });

  assert.equal(card.visible, true);
  assert.equal(card.tone, "error");
  assert.match(card.headline, /failed/i);
  assert.match(card.detail ?? "", /rate limit/);
});
