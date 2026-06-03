import assert from "node:assert/strict";
import { classifyPromptRoute } from "../../dist/server/agents/routingHeuristics.js";
import { forcesDirectAnswerRoute } from "../../dist/server/agents/directAnswerHeuristic.js";
import { DIRECT_ANSWER_ID } from "../../dist/server/config/routes.js";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const marketingHeroPrompt =
  "A startup homepage says: 'We leverage AI to optimize workflows.' Rewrite the hero so a normal business owner understands it.";

const clearerHeroPrompt = "Rewrite this hero to be clearer and less corporate.";

const hvacColdEmail =
  "Write a cold email to a local HVAC owner offering a 14-day paid pilot for missed-call recovery.";

const productPriority =
  "Users keep asking for CSV export, dashboard filters, and SMS alerts. Which should a small SaaS team build first?";

test("marketing hero rewrite routes direct_answer", () => {
  const route = classifyPromptRoute(marketingHeroPrompt);
  assert.ok(route);
  assert.equal(route.selectedWorkflow, DIRECT_ANSWER_ID);
  assert.equal(forcesDirectAnswerRoute(marketingHeroPrompt), true);
});

test("rewrite hero clearer routes direct_answer", () => {
  const route = classifyPromptRoute(clearerHeroPrompt);
  assert.ok(route);
  assert.equal(route.selectedWorkflow, DIRECT_ANSWER_ID);
});

test("HVAC cold email routes sales-attack", () => {
  const route = classifyPromptRoute(hvacColdEmail);
  assert.ok(route);
  assert.equal(route.selectedWorkflow, "sales-attack");
  assert.equal(forcesDirectAnswerRoute(hvacColdEmail), false);
});

test("make this sound human routes direct_answer", () => {
  const route = classifyPromptRoute("Make this sound human, not corporate.");
  assert.ok(route);
  assert.equal(route.selectedWorkflow, DIRECT_ANSWER_ID);
});

test("summarize one sentence routes direct_answer", () => {
  const route = classifyPromptRoute("Summarize this in one sentence.");
  assert.ok(route);
  assert.equal(route.selectedWorkflow, DIRECT_ANSWER_ID);
});

test("calm support response routes direct_answer", () => {
  const route = classifyPromptRoute(
    "A customer says: 'Your app charged me but I can't access my account.' Write a calm support response.",
  );
  assert.ok(route);
  assert.equal(route.selectedWorkflow, DIRECT_ANSWER_ID);
});

test("product priority routes product-decision", () => {
  const route = classifyPromptRoute(productPriority);
  assert.ok(route);
  assert.equal(route.selectedWorkflow, "product-decision");
});

test("Who is it for? routes direct_answer", () => {
  const route = classifyPromptRoute("Who is it for?");
  assert.ok(route);
  assert.equal(route.selectedWorkflow, DIRECT_ANSWER_ID);
});

test("simple follow-up email routes direct_answer", () => {
  const route = classifyPromptRoute("Write a follow-up email.");
  assert.ok(route);
  assert.equal(route.selectedWorkflow, DIRECT_ANSWER_ID);
});

test("follow-up rewrite routes direct_answer", () => {
  const route = classifyPromptRoute("Make this follow-up more professional.");
  assert.ok(route);
  assert.equal(route.selectedWorkflow, DIRECT_ANSWER_ID);
});

test("sales follow-up campaign strategy routes sales-attack", () => {
  const route = classifyPromptRoute("Design a GTM follow-up campaign with ICP, objections, and sequence.");
  assert.ok(route);
  assert.equal(route.selectedWorkflow, "sales-attack");
});
