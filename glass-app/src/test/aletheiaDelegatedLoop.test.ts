import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDelegatedLoopHandoff,
  buildDelegatedLoopPlan,
  classifyDelegatedLoopIntent,
  delegatedLoopIntroSpeech,
  initialDelegatedLoopSnapshot,
  isDelegatedLoopRunning,
  narrativeForStepStart,
  resolveVoiceLoopDecision,
} from "../shared/aletheiaDelegatedLoop.ts";

test("classifyDelegatedLoopIntent matches multi-step phrasing", () => {
  const intent = classifyDelegatedLoopIntent(
    "Work through the launch checklist for me and report back when done",
  );
  assert.ok(intent);
  assert.match(intent!.goal, /launch checklist/i);
});

test("classifyDelegatedLoopIntent matches step-away phrasing", () => {
  const intent = classifyDelegatedLoopIntent(
    "Step away while you handle the onboarding emails across apps",
  );
  assert.ok(intent);
});

test("classifyDelegatedLoopIntent ignores single-app delegated phrasing", () => {
  assert.equal(
    classifyDelegatedLoopIntent("Go to Figma and tell me what's on the artboard"),
    null,
  );
});

test("buildDelegatedLoopPlan includes research and handoff for research goals", () => {
  const plan = buildDelegatedLoopPlan("Research competitor pricing and draft a summary memo");
  assert.ok(plan.some((s) => s.kind === "research"));
  assert.ok(plan.some((s) => s.kind === "writing"));
  assert.equal(plan[plan.length - 1]?.kind, "handoff");
});

test("buildDelegatedLoopPlan defaults to observe when no specific steps", () => {
  const plan = buildDelegatedLoopPlan("Handle the launch checklist end to end for the demo");
  assert.ok(plan.some((s) => s.kind === "observe_context" || s.kind === "handoff"));
});

test("isDelegatedLoopRunning tracks active phases", () => {
  const snapshot = initialDelegatedLoopSnapshot(
    "Work through X",
    buildDelegatedLoopPlan("Work through X"),
  );
  assert.equal(isDelegatedLoopRunning(snapshot), true);
  assert.equal(
    isDelegatedLoopRunning({ ...snapshot, phase: "complete" }),
    false,
  );
});

test("resolveVoiceLoopDecision resolves continue and cancel while awaiting", () => {
  const snapshot = initialDelegatedLoopSnapshot(
    "Work through X",
    buildDelegatedLoopPlan("Work through X"),
  );
  const awaiting = { ...snapshot, phase: "awaiting_decision" as const };
  assert.equal(resolveVoiceLoopDecision("yes continue", awaiting), "continue");
  assert.equal(resolveVoiceLoopDecision("stop", awaiting), "cancel");
  assert.equal(resolveVoiceLoopDecision("yes", snapshot), null);
});

test("buildDelegatedLoopHandoff summarizes completed and remaining work", () => {
  let snapshot = initialDelegatedLoopSnapshot(
    "Work through launch",
    [
      { id: "s1", kind: "research", label: "Checking sources", prompt: "x" },
      { id: "s2", kind: "handoff", label: "Handoff", prompt: "x" },
    ],
  );
  snapshot = {
    ...snapshot,
    steps: snapshot.steps.map((s) =>
      s.id === "s1" ? { ...s, status: "done", result: "Found three sources." } : s,
    ),
    phase: "complete",
  };
  const handoff = buildDelegatedLoopHandoff(snapshot);
  assert.match(handoff.completed, /Checking sources/i);
  assert.match(narrativeForStepStart({ id: "r", kind: "research", label: "R", prompt: "p" }), /checking sources/i);
  assert.match(delegatedLoopIntroSpeech(), /step by step/i);
});
