import assert from "node:assert/strict";
import { buildArtifactFromAnswer } from "../../dist/server/artifacts/artifactBuilder.js";
import { selectArtifactType } from "../../dist/server/artifacts/artifactSelector.js";
import { cleanArtifactText } from "../../dist/server/artifacts/cleanArtifactText.js";
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

const coldEmailAnswer = `## **Cold Email**

## Subject options
- Quick pilot for missed calls
- 14-day HVAC recovery test

## Email body
Hi {{name}},

We help HVAC shops recover missed calls in 14 days.

## Follow-up
Just bumping this — still interested?

## Why this works
Short, local, specific offer.`;

test("selector: cold email → cold_email / inline", () => {
  const prompt = "Write a cold email to a local HVAC owner.";
  const plan = resolveResponsePlan(prompt);
  const sel = selectArtifactType({
    taskIntent: plan.intent,
    responseContract: plan.contract,
    prompt,
  });
  assert.equal(sel.type, "cold_email");
  assert.equal(sel.renderMode, "inline");
});

test("selector: support response → support_reply / inline", () => {
  const prompt =
    "A customer says: I was charged but cannot access my account. Write a calm support response.";
  const plan = resolveResponsePlan(prompt);
  const sel = selectArtifactType({
    taskIntent: plan.intent,
    responseContract: plan.contract,
    prompt,
  });
  assert.equal(sel.type, "support_reply");
  assert.equal(sel.renderMode, "inline");
});

test("selector: financial table → financial_table / inline", () => {
  const prompt = "Create a financial table for monthly burn and runway.";
  const plan = resolveResponsePlan(prompt);
  const sel = selectArtifactType({
    taskIntent: plan.intent,
    responseContract: plan.contract,
    prompt,
  });
  assert.equal(sel.type, "financial_table");
  assert.equal(sel.renderMode, "inline");
});

test("selector: build full landing page → canvas_project / canvas", () => {
  const prompt = "Build me a full landing page for my SaaS product.";
  const plan = resolveResponsePlan(prompt);
  const sel = selectArtifactType({
    taskIntent: plan.intent,
    responseContract: plan.contract,
    prompt,
  });
  assert.equal(sel.type, "canvas_project");
  assert.equal(sel.renderMode, "canvas");
});

test("cleanArtifactText removes ## ** noise", () => {
  const cleaned = cleanArtifactText("## **Cold Email**\n\nHello there.");
  assert.ok(!cleaned.includes("##"));
  assert.ok(!cleaned.includes("**"));
  assert.match(cleaned, /Cold Email/);
});

test("builder: cold email creates sections and copy actions", () => {
  const plan = resolveResponsePlan("Write a cold email to HVAC owners.");
  const artifact = buildArtifactFromAnswer({
    artifactType: "cold_email",
    answer: coldEmailAnswer,
    prompt: "Write a cold email",
    responseContract: plan.contract,
  });
  assert.ok(artifact);
  assert.equal(artifact!.type, "cold_email");
  assert.ok(artifact!.sections.length >= 2);
  assert.ok(artifact!.actions.includes("copy"));
  const labels = artifact!.sections.map((s) => s.label.toLowerCase());
  assert.ok(labels.some((l) => l.includes("subject")));
  assert.ok(labels.some((l) => l.includes("body") || l.includes("email")));
});

test("builder: support reply has reply section", () => {
  const plan = resolveResponsePlan("Write a support response.");
  const artifact = buildArtifactFromAnswer({
    artifactType: "support_reply",
    answer: "## Reply\n\nSorry for the trouble — we are fixing access now.\n\n## Internal note\nEscalate to billing.",
    prompt: "support response",
    responseContract: plan.contract,
  });
  assert.ok(artifact);
  assert.equal(artifact!.type, "support_reply");
  assert.ok(artifact!.actions.includes("copy"));
});
