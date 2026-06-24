import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGlassIdeStreamFeed } from "../shared/glassIdeStreamFeed.ts";
import type { GlassState } from "../shared/ipc.ts";

function baseState(overrides: Partial<GlassState> = {}): GlassState {
  return {
    glassIdeActive: true,
    agentChangeLog: [],
    glassSettings: {},
    ...overrides,
  } as GlassState;
}

test("buildGlassIdeStreamFeed idle when no activity", () => {
  const feed = buildGlassIdeStreamFeed({
    state: baseState(),
    answer: "",
    runId: null,
  });
  assert.equal(feed.idle, true);
  assert.equal(feed.idleLabel, "Ready — describe a task below");
  assert.equal(feed.items.length, 0);
});

test("buildGlassIdeStreamFeed shows running and collapsed output", () => {
  const feed = buildGlassIdeStreamFeed({
    state: baseState({
      agentRun: { agentId: "coder", runId: "r1", status: "running", updatedAt: Date.now() },
    }),
    answer: "Working on it…",
    runId: "r1",
    taskPrompt: "Fix the login bug",
  });
  assert.equal(feed.idle, false);
  assert.equal(feed.hasStreamOutput, true);
  assert.equal(feed.streamCollapsedDefault, false);
  assert.ok(feed.items.some((i) => i.id === "status-running"));
});

test("buildGlassIdeStreamFeed maps changelog to feed rows", () => {
  const feed = buildGlassIdeStreamFeed({
    state: baseState({
      agentRun: { agentId: "coder", runId: "r1", status: "done", updatedAt: Date.now() },
      agentChangeLog: [
        {
          runId: "r1",
          path: "/p/a.ts",
          relativePath: "src/a.ts",
          action: "applied",
          description: "edit",
          at: 1,
        },
      ],
    }),
    answer: "",
    runId: "r1",
  });
  assert.ok(feed.items.some((i) => i.label === "Changed a.ts"));
});

test("buildGlassIdeStreamFeed delegates approval to editor", () => {
  const feed = buildGlassIdeStreamFeed({
    state: baseState({
      agentRun: { agentId: "coder", runId: "r1", status: "running", updatedAt: Date.now() },
      agentPendingApproval: {
        agentId: "coder",
        runId: "r1",
        pendingToolId: "t1",
        pendingToolName: "write_file",
        relativePath: "src/auth.ts",
        description: "update auth",
        displayLines: [],
        isDelete: false,
      } as unknown as GlassState["agentPendingApproval"],
    }),
    answer: "",
    runId: "r1",
  });
  const approval = feed.items.find((i) => i.id === "approval");
  assert.ok(approval);
  assert.match(approval!.label, /auth\.ts/);
  assert.equal(approval!.relativePath, "src/auth.ts");
});
