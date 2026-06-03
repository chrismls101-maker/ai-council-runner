import assert from "node:assert/strict";
import { detectTaskIntent } from "../../dist/server/responseContracts/taskIntent.js";
import { selectResponseContract } from "../../dist/server/responseContracts/responseContract.js";
import { selectRouteLane } from "../../dist/server/responseContracts/routeLane.js";
import { resolveResponsePlan } from "../../dist/server/responseContracts/resolveResponsePlan.js";
import {
  buildContractInstruction,
  buildFinalJudgeContractTask,
} from "../../dist/server/responseContracts/contractFormatter.js";
import { scoreContractCompliance } from "../../dist/server/responseContracts/contractScoring.js";
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

const marketingHero =
  "A startup homepage says: 'We leverage AI to optimize workflows.' Rewrite the hero so a normal business owner understands it.";

const hvacColdEmail =
  "Write a cold email to a local HVAC owner offering a 14-day paid pilot for missed-call recovery.";

test("task intent: cold email → asset_generation", () => {
  const r = detectTaskIntent(hvacColdEmail);
  assert.equal(r.intent, "asset_generation");
});

test("task intent: rewrite hero → rewrite_polish", () => {
  assert.equal(detectTaskIntent(marketingHero).intent, "rewrite_polish");
  assert.equal(detectTaskIntent("Rewrite this hero to be clearer and less corporate.").intent, "rewrite_polish");
});

test("task intent: summarize → summary", () => {
  assert.equal(detectTaskIntent("Summarize this in one sentence.").intent, "summary");
});

test("task intent: decision → decision", () => {
  assert.equal(
    detectTaskIntent("Should I build CSV export or SMS alerts first?").intent,
    "decision",
  );
});

test("task intent: strategy vs asset disambiguation", () => {
  assert.equal(detectTaskIntent("How should I sell with cold email?").intent, "strategy");
  assert.equal(detectTaskIntent(hvacColdEmail).intent, "asset_generation");
});

test("route lane: rewrite → fast_direct", () => {
  const plan = resolveResponsePlan(marketingHero);
  assert.equal(plan.lane.lane, "fast_direct");
  assert.equal(plan.lane.preferredRoute, "direct_answer");
  assert.equal(plan.contract.id, "rewrite_only");
});

test("route lane: cold email → sales-attack council_hidden", () => {
  const plan = resolveResponsePlan(hvacColdEmail);
  assert.equal(plan.lane.preferredRoute, "sales-attack");
  assert.equal(plan.lane.lane, "council_hidden");
  assert.equal(plan.contract.id, "deliverable_first");
});

test("routing: marketing hero → direct_answer", () => {
  const route = classifyPromptRoute(marketingHero);
  assert.ok(route);
  assert.equal(route!.selectedWorkflow, DIRECT_ANSWER_ID);
});

test("routing: HVAC cold email → sales-attack", () => {
  const route = classifyPromptRoute(hvacColdEmail);
  assert.ok(route);
  assert.equal(route!.selectedWorkflow, "sales-attack");
});

test("contract instruction forbids Final Action Plan opener", () => {
  const plan = resolveResponsePlan(hvacColdEmail);
  const instruction = buildContractInstruction(plan.contract, plan.intent);
  assert.match(instruction, /Final Action Plan/i);
  assert.match(instruction, /Do NOT open/i);
  assert.match(buildFinalJudgeContractTask(plan.contract), /deliverable first/i);
});

test("contract scoring: Final Action Plan opener → violation", () => {
  const plan = resolveResponsePlan(hvacColdEmail);
  const bad = `## Final Action Plan\n### Do This First\n\nSubject: Hi`;
  const scored = scoreContractCompliance(plan.contract, plan.intent.intent, bad);
  assert.ok(scored.violations.includes("wrong_output_format"));
});

test("contract scoring: email first → pass", () => {
  const plan = resolveResponsePlan(hvacColdEmail);
  const good = `Subject: Recover missed calls\n\nHi — we help HVAC owners recover missed calls with a 14-day pilot.\n\nCTA: Reply YES`;
  const scored = scoreContractCompliance(plan.contract, plan.intent.intent, good);
  assert.equal(scored.violations.length, 0);
});

test("contract scoring: decision recommendation first → pass", () => {
  const plan = resolveResponsePlan("Which should we build first: CSV export or SMS alerts?");
  const good = "Recommendation: Build CSV export first because it unblocks reporting for every customer.";
  const scored = scoreContractCompliance(plan.contract, plan.intent.intent, good);
  assert.equal(scored.violations.length, 0);
});
