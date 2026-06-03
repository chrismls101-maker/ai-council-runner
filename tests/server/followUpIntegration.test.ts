import assert from "node:assert/strict";
import { buildFullPrompt } from "../../dist/server/presets/index.js";
import { detectDirectAnswer } from "../../dist/server/agents/directAnswerHeuristic.js";
import { classifyPromptRoute } from "../../dist/server/agents/routingHeuristics.js";
import {
  PRESET_BLEED_MARKERS,
  buildConversationContextBlock,
  buildRouterPrompt,
  buildSlimDirectAnswerPrompt,
  expandFollowUpPrompt,
  resolveRoutingPrompt,
  shouldForceDirectAnswerRoute,
  shouldOmitPresetContext,
  shouldStripMemoryForIivoIdentity,
} from "../../dist/server/conversation/followUpContext.js";

const PRESET = "ai-front-desk-sales-test";
const ctxIivo = {
  previousUserPrompt: "What is IIVO?",
  previousAssistantAnswer:
    "IIVO is an AI decision engine that routes one question through direct answers, verified search, or a specialist council.",
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

function assertNoPresetBleed(promptText: string) {
  for (const marker of PRESET_BLEED_MARKERS) {
    assert.equal(
      promptText.includes(marker),
      false,
      `Prompt must not contain "${marker}"`,
    );
  }
}

test("Request 2 — resolved prompt is Who is IIVO for?", () => {
  assert.equal(expandFollowUpPrompt("Who is it for?", ctxIivo), "Who is IIVO for?");
  assert.equal(resolveRoutingPrompt("Who is it for?", ctxIivo), "Who is IIVO for?");
});

test("Request 2 — routes as direct_answer with conversation context", () => {
  const routingPrompt = resolveRoutingPrompt("Who is it for?", ctxIivo);
  assert.equal(detectDirectAnswer(routingPrompt), true);
  assert.equal(classifyPromptRoute(routingPrompt)?.selectedWorkflow, "direct_answer");
  assert.equal(shouldForceDirectAnswerRoute("Who is it for?", ctxIivo), true);
});

test("Request 2 — router wrapper still heuristics to direct_answer", () => {
  const routerInput = buildRouterPrompt("Who is it for?", ctxIivo);
  const routingPrompt = resolveRoutingPrompt("Who is it for?", ctxIivo);
  assert.match(routerInput, /Who is IIVO for\?/);
  assert.equal(classifyPromptRoute(routingPrompt)?.selectedWorkflow, "direct_answer");
});

test("Request 2 — omitPreset and strip memory for IIVO follow-up", () => {
  assert.equal(
    shouldOmitPresetContext({
      prompt: "Who is it for?",
      preset: PRESET,
      isDirectAnswer: true,
      conversationContext: ctxIivo,
    }),
    true,
  );
  assert.equal(
    shouldStripMemoryForIivoIdentity({
      prompt: "Who is it for?",
      conversationContext: ctxIivo,
      omitPreset: true,
    }),
    true,
  );
});

test("Request 2 — slim direct answer prompt has no AI Front Desk bleed", () => {
  const conversationBlock = buildConversationContextBlock("Who is it for?", ctxIivo);
  const routingPrompt = resolveRoutingPrompt("Who is it for?", ctxIivo);
  const omitPreset = shouldOmitPresetContext({
    prompt: "Who is it for?",
    preset: PRESET,
    isDirectAnswer: true,
    conversationContext: ctxIivo,
  });

  const slim = buildSlimDirectAnswerPrompt({
    routingPrompt,
    conversationBlock,
  });

  const fullWithoutPreset = buildFullPrompt(PRESET, "Who is it for?", {
    conversationBlock,
    omitPreset,
  });

  assert.equal(omitPreset, true);
  assert.match(slim, /Who is IIVO for\?/);
  assert.match(slim, /Previous user question: What is IIVO\?/);
  assertNoPresetBleed(slim);
  assertNoPresetBleed(fullWithoutPreset);
});

test("Request 1 — What is IIVO? omits preset for direct answer", () => {
  assert.equal(
    shouldOmitPresetContext({
      prompt: "What is IIVO?",
      preset: PRESET,
      isDirectAnswer: true,
    }),
    true,
  );
  const prompt = buildFullPrompt(PRESET, "What is IIVO?", { omitPreset: true });
  assertNoPresetBleed(prompt);
});

console.log("\nAll follow-up integration tests passed.");
