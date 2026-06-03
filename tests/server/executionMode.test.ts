import assert from "node:assert/strict";
import { resolveExecutionMode } from "../../dist/server/executionMode/executionMode.js";
import { resolveResponsePlan } from "../../dist/server/responseContracts/resolveResponsePlan.js";
import { selectArtifactType } from "../../dist/server/artifacts/artifactSelector.js";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

function planFor(prompt: string) {
  const responsePlan = resolveResponsePlan(prompt);
  const artifactSelection = selectArtifactType({
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    prompt,
  });
  return { responsePlan, artifactSelection };
}

test("auto: rewrite hero → quick", () => {
  const prompt = "Rewrite this hero so a normal business owner understands it.";
  const { responsePlan, artifactSelection } = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "auto",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    artifactSelection,
    prompt,
  });
  assert.equal(d.effectiveMode, "quick");
});

test("auto: support billing → quick", () => {
  const prompt =
    "A customer says they were charged but cannot access their account. Write a calm support response.";
  const { responsePlan, artifactSelection } = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "auto",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    artifactSelection,
    prompt,
  });
  assert.equal(d.effectiveMode, "quick");
});

test("auto: legal/privacy → quick", () => {
  const prompt =
    "A SaaS collects emails and files. What privacy promises should it avoid making?";
  const { responsePlan, artifactSelection } = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "auto",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    artifactSelection,
    prompt,
  });
  assert.equal(d.effectiveMode, "quick");
});

test("auto: founder decision → council", () => {
  const prompt =
    "I have $1,500 and 14 days. Should I build a demo, cold outreach, or a landing page?";
  const { responsePlan, artifactSelection } = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "auto",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    artifactSelection,
    prompt,
  });
  assert.equal(d.effectiveMode, "council");
});

test("auto: one cold email → quick", () => {
  const prompt =
    "Write a cold email to a local HVAC owner offering a 14-day paid pilot for missed-call recovery.";
  const { responsePlan, artifactSelection } = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "auto",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    artifactSelection,
    prompt,
  });
  assert.equal(d.effectiveMode, "quick");
});

test("auto: full GTM → council", () => {
  const prompt = "Build a go-to-market strategy for missed-call recovery.";
  const { responsePlan, artifactSelection } = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "auto",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    artifactSelection,
    prompt,
  });
  assert.equal(d.effectiveMode, "council");
});

test("auto: full landing page → builder confirmation", () => {
  const prompt = "Build me a full landing page for my B2B SaaS.";
  const { responsePlan, artifactSelection } = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "auto",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    artifactSelection,
    prompt,
  });
  assert.equal(d.effectiveMode, "builder");
  assert.equal(d.requiresConfirmation, true);
  assert.equal(d.confirmationKind, "builder");
});

test("quick mode forces quick", () => {
  const prompt = "Should I build CSV export or SMS alerts first?";
  const { responsePlan, artifactSelection } = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "quick",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    artifactSelection,
    prompt,
  });
  assert.equal(d.effectiveMode, "quick");
});

test("council mode forces council", () => {
  const prompt = "Should I build CSV export or SMS alerts first?";
  const { responsePlan, artifactSelection } = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "council",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    artifactSelection,
    prompt,
  });
  assert.equal(d.effectiveMode, "council");
});

test("auto council confirmation declined → quick", () => {
  const prompt = "Help me decide between two pricing models.";
  const { responsePlan, artifactSelection } = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "auto",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    artifactSelection,
    prompt,
    confirmationAccepted: false,
  });
  if (d.requiresConfirmation) {
    assert.equal(d.effectiveMode, "quick");
  }
});
