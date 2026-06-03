import assert from "node:assert/strict";
import {
  shouldInjectContext,
  GENERIC_RELEVANCE_TERMS,
  promptExplicitlyReferencesDomain,
} from "../../dist/server/contextRelevance/globalContextGuard.js";
import { classifyPromptRoute } from "../../dist/server/agents/routingHeuristics.js";
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

const AFD_OUTCOME_BODY = [
  "AI Front Desk — SMS follow-up decision",
  "Delayed SMS follow-up and focused on missed-call recovery.",
  "0 pilots yet. Targeting plumbers and HVAC for after-hours calls.",
].join("\n");

const supportPrompt =
  "A customer says: 'Your app charged me but I can't access my account.' Write a calm support response.";

const jewelryPrompt =
  "An online jewelry store has traffic but low conversions. What should they check first?";

const privacyPrompt =
  "A SaaS collects customer emails and uploaded files. What privacy promises should it avoid making?";

test("outcome guard excludes AI Front Desk outcome for support response prompt", () => {
  const result = shouldInjectContext({
    userPrompt: supportPrompt,
    contextType: "outcome",
    contextTitle: "AI Front Desk — SMS follow-up",
    contextBody: AFD_OUTCOME_BODY,
    projectName: "AI Front Desk",
  });
  assert.equal(result.allow, false);
  assert.ok(result.blockedTerms && result.blockedTerms.length > 0);
});

test("outcome guard excludes AI Front Desk outcome for jewelry ecommerce conversion prompt", () => {
  const result = shouldInjectContext({
    userPrompt: jewelryPrompt,
    contextType: "outcome",
    contextTitle: "AI Front Desk — SMS follow-up",
    contextBody: AFD_OUTCOME_BODY,
    projectName: "AI Front Desk",
  });
  assert.equal(result.allow, false);
});

test("outcome guard excludes AI Front Desk outcome for privacy policy prompt", () => {
  const result = shouldInjectContext({
    userPrompt: privacyPrompt,
    contextType: "outcome",
    contextTitle: "AI Front Desk — SMS follow-up",
    contextBody: AFD_OUTCOME_BODY,
    projectName: "AI Front Desk",
  });
  assert.equal(result.allow, false);
});

test("outcome guard includes AI Front Desk outcome when prompt references delayed SMS and 0 pilots", () => {
  const result = shouldInjectContext({
    userPrompt:
      "Given the delayed SMS outcome and 0 pilots, should I keep testing AI Front Desk?",
    contextType: "outcome",
    contextTitle: "AI Front Desk — SMS follow-up",
    contextBody: AFD_OUTCOME_BODY,
    projectName: "AI Front Desk",
  });
  assert.equal(result.allow, true);
  assert.equal(result.confidence, "explicit");
});

test("outcome guard includes when prompt asks what was decided about SMS follow-up", () => {
  const result = shouldInjectContext({
    userPrompt: "What did I decide last time about SMS follow-up?",
    contextType: "outcome",
    contextTitle: "AI Front Desk — SMS follow-up",
    contextBody: AFD_OUTCOME_BODY,
    projectName: "AI Front Desk",
  });
  assert.equal(result.allow, true);
  assert.match(result.reason, /prior decision|outcome|history/i);
});

test("generic words alone do not create relevance", () => {
  const result = shouldInjectContext({
    userPrompt:
      "app customer business AI sales support traffic conversion test strategy workflow",
    contextType: "outcome",
    contextTitle: "AI Front Desk — SMS follow-up",
    contextBody: AFD_OUTCOME_BODY,
    projectName: "AI Front Desk",
  });
  assert.equal(result.allow, false);
  for (const term of ["app", "customer", "business", "ai", "sales"]) {
    assert.ok(GENERIC_RELEVANCE_TERMS.has(term), `expected generic term: ${term}`);
  }
});

test("support billing/access response routes Direct Answer", () => {
  const route = classifyPromptRoute(supportPrompt);
  assert.ok(route);
  assert.equal(route.selectedWorkflow, DIRECT_ANSWER_ID);
});

test("privacy promises prompt routes Direct Answer", () => {
  const route = classifyPromptRoute(privacyPrompt);
  assert.ok(route);
  assert.equal(route.selectedWorkflow, DIRECT_ANSWER_ID);
});

test("HVAC cold email routes Sales Attack", () => {
  const route = classifyPromptRoute(
    "Write a cold email to a local HVAC owner offering a 14-day paid pilot for missed-call recovery.",
  );
  assert.ok(route);
  assert.equal(route.selectedWorkflow, "sales-attack");
});

test("promptExplicitlyReferencesDomain is false for jewelry prompt", () => {
  assert.equal(promptExplicitlyReferencesDomain(jewelryPrompt), false);
});

test("HVAC cold email prompt does not unlock AI Front Desk domain via missed-call recovery alone", () => {
  const hvacPrompt =
    "Write a cold email to a local HVAC owner offering a 14-day paid pilot for missed-call recovery.";
  assert.equal(promptExplicitlyReferencesDomain(hvacPrompt), false);
  const result = shouldInjectContext({
    userPrompt: hvacPrompt,
    contextType: "outcome",
    contextTitle: "AI Front Desk — SMS follow-up",
    contextBody: AFD_OUTCOME_BODY,
    projectName: "AI Front Desk",
  });
  assert.equal(result.allow, false);
});
