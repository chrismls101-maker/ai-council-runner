import { test } from "node:test";
import assert from "node:assert/strict";
import { getScenarioById, scenariosByCategory } from "../shared/qaScenarioBank.ts";
// JS audit scorer (shared with the live category audit).
import { scoreCategoryAnswer, answerSimilarity } from "../../scripts/lib/glass-answer-quality.mjs";

function transcript(id: string): string {
  const s = getScenarioById(id);
  assert.ok(s, `scenario ${id} exists`);
  return s.transcriptChunks.join(" ");
}

test("scenario bank has >= 8 scenarios for each upgraded category", () => {
  assert.ok(scenariosByCategory("video_learning").length >= 8);
  assert.ok(scenariosByCategory("creator_content").length >= 8);
  assert.ok(scenariosByCategory("sales_review").length >= 8);
});

test("video_learning topics are varied (not all investing)", () => {
  const sims = scenariosByCategory("video_learning").filter((s) => s.testKind === "simulated");
  const text = sims.map((s) => s.transcriptChunks.join(" ").toLowerCase());
  const investing = text.filter((t) => /diversif|dollar-cost|rebalance/.test(t)).length;
  assert.ok(investing <= 2, `too many investing lessons: ${investing}`);
  // Distinct topics present.
  assert.ok(text.some((t) => /useeffect|usestate/.test(t)), "react lesson");
  assert.ok(text.some((t) => /mitochondria|atp/.test(t)), "biology lesson");
});

test("video_learning_01 and video_learning_03 are not near-identical", () => {
  assert.ok(answerSimilarity(transcript("video_learning_01"), transcript("video_learning_03")) < 0.4);
});

test("creator_content_01..04 are not near-identical", () => {
  const ids = ["creator_content_01", "creator_content_02", "creator_content_03", "creator_content_04"];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const sim = answerSimilarity(transcript(ids[i]), transcript(ids[j]));
      assert.ok(sim < 0.5, `${ids[i]} vs ${ids[j]} too similar: ${sim.toFixed(2)}`);
    }
  }
});

test("sales scenarios carry prospect names and objections", () => {
  const sales = scenariosByCategory("sales_review").filter((s) => s.id !== "sales_review_12");
  for (const s of sales) {
    if (s.testKind === "controlled_visual_fixture") continue;
    assert.ok((s.expectedAnchors ?? []).length >= 3, `${s.id} needs anchors`);
  }
  const acme = getScenarioById("sales_review_01");
  assert.match(acme!.transcriptChunks.join(" "), /Acme/);
  assert.match(acme!.transcriptChunks.join(" "), /objection/i);
});

// --- scorer behavior ---

test("scorer rates a specific, actionable answer strong", () => {
  const scenario = getScenarioById("sales_review_01")!;
  const answer =
    "Acme is in negotiation on the $60k deal. The objection is that our price is 20% above budget. " +
    "Next step: send the ROI one-pager before Friday's call and offer an annual-prepay discount to close the gap.";
  const r = scoreCategoryAnswer({ answer, scenario });
  assert.equal(r.verdict, "strong");
});

test("scorer rates a generic answer with no session facts weak", () => {
  const scenario = getScenarioById("video_learning_05")!; // biology lesson
  const generic =
    "Remember to diversify your portfolio, use dollar-cost averaging, and rebalance regularly. Avoid timing the market.";
  const r = scoreCategoryAnswer({ answer: generic, scenario });
  assert.equal(r.verdict, "weak");
  assert.equal(r.genericFlag, true);
});

test("scorer rates a thin-context answer acceptable when it states what is missing", () => {
  const scenario = getScenarioById("creator_content_12")!; // thin
  const honest =
    "There isn't enough here yet. The topic, target audience, title, thumbnail, CTA, and platform are not defined. " +
    "Define those before planning the episode.";
  const r = scoreCategoryAnswer({ answer: honest, scenario });
  assert.equal(r.thin, true);
  assert.equal(r.verdict, "acceptable");
});

test("scorer rates a thin-context answer weak when it invents specifics instead of flagging gaps", () => {
  const scenario = getScenarioById("sales_review_12")!; // thin
  const invented =
    "Send a follow-up to Acme about the pricing objection and confirm the demo for Friday.";
  const r = scoreCategoryAnswer({ answer: invented, scenario });
  assert.equal(r.thin, true);
  assert.equal(r.verdict, "weak");
});
