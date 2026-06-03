import assert from "node:assert/strict";
import { resolveExecutionMode } from "../../dist/server/executionMode/executionMode.js";
import { resolveResponsePlan } from "../../dist/server/responseContracts/resolveResponsePlan.js";

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
  return resolveResponsePlan(prompt);
}

test("auto: rewrite hero → quick", () => {
  const prompt = "Rewrite this hero so a normal business owner understands it.";
  const responsePlan = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "auto",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    prompt,
  });
  assert.equal(d.effectiveMode, "quick");
});

test("auto: support billing → quick", () => {
  const prompt =
    "A customer says they were charged but cannot access their account. Write a calm support response.";
  const responsePlan = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "auto",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    prompt,
  });
  assert.equal(d.effectiveMode, "quick");
});

test("auto: legal/privacy → quick", () => {
  const prompt =
    "A SaaS collects emails and files. What privacy promises should it avoid making?";
  const responsePlan = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "auto",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    prompt,
  });
  assert.equal(d.effectiveMode, "quick");
});

test("auto: cold email → quick", () => {
  const prompt = "Write a cold email to HVAC owners about missed-call recovery.";
  const responsePlan = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "auto",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    prompt,
  });
  assert.equal(d.effectiveMode, "quick");
});

test("auto: strategic decision → council confirmation", () => {
  const prompt = "Should I build AI receptionist or missed-call SMS recovery first?";
  const responsePlan = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "auto",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    prompt,
  });
  assert.equal(d.effectiveMode, "council");
  assert.equal(d.confirmationKind, "council");
});

test("council mode stays council", () => {
  const prompt = "Should I prioritize enterprise or SMB for our GTM?";
  const responsePlan = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "council",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    prompt,
  });
  assert.equal(d.effectiveMode, "council");
});

test("quick mode stays quick", () => {
  const prompt = "Summarize this customer complaint in two sentences.";
  const responsePlan = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "quick",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    prompt,
  });
  assert.equal(d.effectiveMode, "quick");
});

test("auto: full landing page → quick (no builder mode)", () => {
  const prompt = "Build me a full landing page for HVAC missed-call recovery SaaS.";
  const responsePlan = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "auto",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    prompt,
  });
  assert.notEqual(d.effectiveMode, "builder");
  assert.equal(d.effectiveMode, "quick");
});

test("user declines council confirmation → quick", () => {
  const prompt = "Help me decide whether to expand to a second city.";
  const responsePlan = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "auto",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    prompt,
    confirmationAccepted: false,
  });
  assert.equal(d.effectiveMode, "quick");
});

test("user accepts council confirmation → council", () => {
  const prompt = "Help me decide whether to expand to a second city.";
  const responsePlan = planFor(prompt);
  const d = resolveExecutionMode({
    userSelectedMode: "auto",
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    prompt,
    confirmationAccepted: true,
  });
  assert.equal(d.effectiveMode, "council");
});
