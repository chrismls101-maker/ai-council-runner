import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advanceAgentActivityStep,
  agentActivitySnapshotsEqual,
  classifyCoordinationIntent,
  coordinationRouteNarration,
  councilStepIdForRole,
  finalizeAgentActivity,
  initialAgentActivitySnapshot,
  stepLabelsForRoute,
  updateAgentActivityStep,
} from "../shared/aletheiaAgentCoordinator.ts";

test("classifyCoordinationIntent routes council phrasing", () => {
  const intent = classifyCoordinationIntent("Can you figure out the best approach for our launch?");
  assert.ok(intent);
  assert.equal(intent!.route, "council");
});

test("classifyCoordinationIntent routes research phrasing", () => {
  const intent = classifyCoordinationIntent("Research the latest on EU AI regulation");
  assert.ok(intent);
  assert.equal(intent!.route, "research");
});

test("classifyCoordinationIntent routes writing phrasing", () => {
  const intent = classifyCoordinationIntent("Write me a product launch email for Glass v0.7");
  assert.ok(intent);
  assert.equal(intent!.route, "writing");
});

test("classifyCoordinationIntent routes research-then-write before single research", () => {
  const intent = classifyCoordinationIntent("Research competitor pricing and then draft a summary memo");
  assert.ok(intent);
  assert.equal(intent!.route, "research_then_write");
});

test("classifyCoordinationIntent ignores generic asks", () => {
  assert.equal(classifyCoordinationIntent("hello"), null);
  assert.equal(classifyCoordinationIntent("what time is it"), null);
});

test("initialAgentActivitySnapshot builds route-specific steps", () => {
  const snapshot = initialAgentActivitySnapshot("council", "Help me decide", 1000);
  assert.equal(snapshot.phase, "routing");
  assert.deepEqual(stepLabelsForRoute("council"), [
    "Planning approach",
    "Stress-testing the plan",
    "Synthesizing answer",
  ]);
  assert.equal(snapshot.steps.length, 3);
  assert.equal(snapshot.steps[0]?.status, "running");
  assert.equal(snapshot.steps[1]?.status, "pending");
});

test("agent activity helpers advance and finalize", () => {
  let snapshot = initialAgentActivitySnapshot("research", "Look up X", 1000);
  snapshot = updateAgentActivityStep(snapshot, "step-1", { status: "done" }, 2000);
  snapshot = finalizeAgentActivity(snapshot, { ok: true, answer: "Found three sources." }, 3000);
  assert.equal(snapshot.phase, "complete");
  assert.equal(snapshot.unifiedAnswer, "Found three sources.");
  assert.equal(snapshot.steps[0]?.status, "done");
});

test("advanceAgentActivityStep marks completion and starts next step", () => {
  const snapshot = initialAgentActivitySnapshot("research_then_write", "Research and draft", 1000);
  const next = advanceAgentActivityStep(snapshot, "step-1", "step-2", 2000);
  assert.equal(next.steps[0]?.status, "done");
  assert.equal(next.steps[1]?.status, "running");
});

test("agentActivitySnapshotsEqual compares step status", () => {
  const a = initialAgentActivitySnapshot("writing", "Draft memo", 1000);
  const b = initialAgentActivitySnapshot("writing", "Draft memo", 1000);
  assert.equal(agentActivitySnapshotsEqual(a, b), false);
  assert.equal(agentActivitySnapshotsEqual(a, a), true);
});

test("councilStepIdForRole maps roles to step ids", () => {
  assert.equal(councilStepIdForRole("strategy"), "step-1");
  assert.equal(councilStepIdForRole("critic"), "step-2");
  assert.equal(councilStepIdForRole("judge"), "step-3");
});

test("coordinationRouteNarration stays user-facing", () => {
  assert.match(coordinationRouteNarration("council"), /one clear answer/i);
  assert.match(coordinationRouteNarration("research"), /what I find/i);
});
