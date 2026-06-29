import { test } from "node:test";
import assert from "node:assert/strict";
import { rollupOrchestrationMetrics } from "../shared/orchestrationMetrics.ts";

/** Mirrors getRetentionSummary() rollup formulas (pure — no SQLite). */
function rollupRetentionMetrics(input: {
  sessionsLast7Days: number;
  workflowsTotal: number;
  autofixShown: number;
  autofixAccepted: number;
  buildLoopCompleted: number;
  buildLoopSucceeded: number;
}) {
  const {
    sessionsLast7Days,
    workflowsTotal,
    autofixShown,
    autofixAccepted,
    buildLoopCompleted,
    buildLoopSucceeded,
  } = input;

  const workflowsPerSession =
    sessionsLast7Days > 0 ? Math.round((workflowsTotal / sessionsLast7Days) * 10) / 10 : 0;

  const autofixAcceptanceRate =
    autofixShown > 0 ? Math.round((autofixAccepted / autofixShown) * 100) / 100 : 0;

  const buildLoopSuccessRate =
    buildLoopCompleted > 0
      ? Math.round((buildLoopSucceeded / buildLoopCompleted) * 100) / 100
      : 0;

  return { workflowsPerSession, autofixAcceptanceRate, buildLoopSuccessRate };
}

test("retention rollup — workflows per session avoids divide-by-zero", () => {
  const r = rollupRetentionMetrics({
    sessionsLast7Days: 0,
    workflowsTotal: 5,
    autofixShown: 0,
    autofixAccepted: 0,
    buildLoopCompleted: 0,
    buildLoopSucceeded: 0,
  });
  assert.equal(r.workflowsPerSession, 0);
  assert.equal(r.autofixAcceptanceRate, 0);
  assert.equal(r.buildLoopSuccessRate, 0);
});

test("retention rollup — acceptance and build success rates", () => {
  const r = rollupRetentionMetrics({
    sessionsLast7Days: 2,
    workflowsTotal: 2,
    autofixShown: 4,
    autofixAccepted: 2,
    buildLoopCompleted: 4,
    buildLoopSucceeded: 3,
  });
  assert.equal(r.workflowsPerSession, 1);
  assert.equal(r.autofixAcceptanceRate, 0.5);
  assert.equal(r.buildLoopSuccessRate, 0.75);
});

test("retention rollup — success meta parsing counts only success=true", () => {
  const metas = [
    JSON.stringify({ success: true }),
    JSON.stringify({ success: false }),
    JSON.stringify({ success: true }),
    null,
  ];
  const buildLoopSucceeded = metas.filter((meta) => {
    try {
      const m = meta ? (JSON.parse(meta) as Record<string, unknown>) : null;
      return m?.success === true;
    } catch {
      return false;
    }
  }).length;
  assert.equal(buildLoopSucceeded, 2);
});

test("orchestration rollup — repair success rate avoids divide-by-zero", () => {
  const r = rollupOrchestrationMetrics({
    memoryFtsFallback: 0,
    designRepairTriggered: 0,
    designRepairSucceeded: 0,
    audioCoderAutoLaunch: 0,
    audioCoderAutoLaunchWithoutWorkspace: 0,
    coderLaunchDedupeSuppressed: 0,
  });
  assert.equal(r.designRepairSuccessRateLast7Days, 0);
  assert.equal(r.memoryFtsFallbackLast7Days, 0);
});

test("orchestration rollup — counts and repair success rate", () => {
  const r = rollupOrchestrationMetrics({
    memoryFtsFallback: 3,
    designRepairTriggered: 4,
    designRepairSucceeded: 3,
    audioCoderAutoLaunch: 5,
    audioCoderAutoLaunchWithoutWorkspace: 2,
    coderLaunchDedupeSuppressed: 1,
  });
  assert.equal(r.memoryFtsFallbackLast7Days, 3);
  assert.equal(r.designRepairSuccessRateLast7Days, 0.75);
  assert.equal(r.audioCoderAutoLaunchLast7Days, 5);
  assert.equal(r.audioCoderAutoLaunchWithoutWorkspaceLast7Days, 2);
  assert.equal(r.coderLaunchDedupeSuppressedLast7Days, 1);
});
