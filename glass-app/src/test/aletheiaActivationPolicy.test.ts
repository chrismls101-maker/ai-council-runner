import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  advanceAletheiaActivationAfterTurn,
  classifyActivationTurn,
  initialAletheiaActivationState,
  resolveActivationContextGate,
  scoreActivationTurn,
} from "../shared/aletheiaActivationPolicy.ts";

describe("scoreActivationTurn", () => {
  test("prefers work score for work-context questions", () => {
    const scores = scoreActivationTurn("how does this function work in auth.ts?");
    assert.ok(scores.work > scores.conversation);
    assert.ok(scores.work > scores.general);
  });

  test("prefers conversation score for generic education questions", () => {
    const scores = scoreActivationTurn("how does async work in JavaScript?");
    assert.ok(scores.conversation >= scores.work);
  });
});

describe("classifyActivationTurn", () => {
  test("detects work commands", () => {
    assert.equal(classifyActivationTurn("fix this error in the terminal"), "work_command");
    assert.equal(classifyActivationTurn("what is on my screen"), "work_command");
  });

  test("detects general off-topic prompts", () => {
    assert.equal(classifyActivationTurn("tell me a joke"), "general");
  });

  test("detects conversational questions", () => {
    assert.equal(classifyActivationTurn("how does async work in JavaScript?"), "conversation");
    assert.equal(classifyActivationTurn("what is a closure?"), "conversation");
  });

  test("detects work-context questions as work commands", () => {
    assert.equal(
      classifyActivationTurn("how does this function work in auth.ts?"),
      "work_command",
    );
    assert.equal(
      classifyActivationTurn("why is this test failing in my repo?"),
      "work_command",
    );
    assert.equal(
      classifyActivationTurn("how do I fix this typescript error?"),
      "work_command",
    );
  });
});

describe("resolveActivationContextGate", () => {
  test("suppresses ambient synthesis on first non-work turn", () => {
    const gate = resolveActivationContextGate({
      activation: initialAletheiaActivationState(),
      companionModeActive: true,
      prompt: "tell me a joke",
    });
    assert.equal(gate.suppressAmbientSynthesis, true);
    assert.equal(gate.requireConfirmObservedContext, false);
    assert.ok(gate.companionActivationHint?.includes("Do not summarize"));
  });

  test("requires confirm observed context for first work command", () => {
    const gate = resolveActivationContextGate({
      activation: initialAletheiaActivationState(),
      companionModeActive: true,
      prompt: "fix this build error",
    });
    assert.equal(gate.suppressAmbientSynthesis, false);
    assert.equal(gate.requireConfirmObservedContext, true);
    assert.ok(gate.companionActivationHint?.includes("confirm what you observe"));
  });

  test("allows synthesis after engagement", () => {
    const engaged = advanceAletheiaActivationAfterTurn(
      initialAletheiaActivationState(),
      "conversation",
    );
    const gate = resolveActivationContextGate({
      activation: engaged,
      companionModeActive: true,
      prompt: "tell me a joke",
    });
    assert.equal(gate.suppressAmbientSynthesis, false);
    assert.equal(gate.requireConfirmObservedContext, false);
  });

  test("follow-up routes bypass presence gate", () => {
    const gate = resolveActivationContextGate({
      activation: initialAletheiaActivationState(),
      companionModeActive: true,
      companionRoute: "direct_follow_up",
      prompt: "and then?",
    });
    assert.equal(gate.suppressAmbientSynthesis, false);
  });
});

describe("advanceAletheiaActivationAfterTurn", () => {
  test("moves to engaged and clears awaitingUserLead", () => {
    const next = advanceAletheiaActivationAfterTurn(
      initialAletheiaActivationState(),
      "work_command",
    );
    assert.equal(next.phase, "engaged");
    assert.equal(next.userTurnCount, 1);
    assert.equal(next.awaitingUserLead, false);
  });
});
