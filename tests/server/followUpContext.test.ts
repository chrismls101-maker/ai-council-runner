import assert from "node:assert/strict";
import {
  buildConversationContextBlock,
  expandFollowUpPrompt,
  isVagueFollowUp,
  resolveFollowUpSubject,
  shouldOmitPresetContext,
  resolveMemoryProjectHint,
} from "../../dist/server/conversation/followUpContext.js";
import { detectDirectAnswer } from "../../dist/server/agents/directAnswerHeuristic.js";
import { classifyPromptRoute } from "../../dist/server/agents/routingHeuristics.js";

const ctxIivo = {
  previousUserPrompt: "What is IIVO?",
  previousAssistantAnswer:
    "IIVO is an AI decision engine that routes one question through direct answers, verified search, or a specialist council.",
};

const ctxFrontDesk = {
  previousUserPrompt: "What is AI Front Desk?",
  previousAssistantAnswer:
    "AI Front Desk is an AI receptionist named Sarah that captures missed calls for local businesses.",
};

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

test("A — Who is it for? after What is IIVO? resolves to IIVO", () => {
  assert.equal(isVagueFollowUp("Who is it for?"), true);
  assert.equal(resolveFollowUpSubject("Who is it for?", ctxIivo), "IIVO");
  assert.equal(expandFollowUpPrompt("Who is it for?", ctxIivo), "Who is IIVO for?");
});

test("B — Who is it for? after What is AI Front Desk? resolves to AI Front Desk", () => {
  assert.equal(resolveFollowUpSubject("Who is it for?", ctxFrontDesk), "AI Front Desk");
  assert.equal(
    expandFollowUpPrompt("Who is it for?", ctxFrontDesk),
    "Who is AI Front Desk for?",
  );
});

test("C — AI Front Desk preset omitted for Who is IIVO for?", () => {
  assert.equal(
    shouldOmitPresetContext({
      prompt: "Who is IIVO for?",
      preset: "ai-front-desk-sales-test",
      isDirectAnswer: true,
    }),
    true,
  );
  assert.equal(
    resolveMemoryProjectHint({
      prompt: "Who is IIVO for?",
      preset: "ai-front-desk-sales-test",
      omitPreset: true,
    }),
    undefined,
  );
});

test("D — preset omitted for What makes IIVO different? with front desk memory preset", () => {
  assert.equal(
    shouldOmitPresetContext({
      prompt: "What makes IIVO different?",
      preset: "ai-front-desk-sales-test",
      isDirectAnswer: true,
    }),
    true,
  );
});

test("follow-up routes as direct answer", () => {
  assert.equal(detectDirectAnswer("Who is it for?"), true);
  assert.equal(classifyPromptRoute("Who is it for?")?.selectedWorkflow, "direct_answer");
  assert.equal(detectDirectAnswer("Who is IIVO for?"), true);
  assert.equal(classifyPromptRoute("Who is IIVO for?")?.selectedWorkflow, "direct_answer");
});

test("conversation block includes resolved meaning", () => {
  const block = buildConversationContextBlock("Who is it for?", ctxIivo);
  assert.match(block ?? "", /Previous user question: What is IIVO\?/);
  assert.match(block ?? "", /Resolved meaning: Who is IIVO for\?/);
});

console.log("\nAll follow-up context tests passed.");
