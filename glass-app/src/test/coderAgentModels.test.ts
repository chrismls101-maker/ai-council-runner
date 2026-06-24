import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CODER_AGENT_MODEL,
  estimateCoderRunCostUsd,
  formatCoderRunUsageLine,
  parseCoderAgentModelId,
  resolveAutoCoderModel,
  resolveCoderAgentApiModel,
  resolveEffectiveCoderModelId,
} from "../shared/coderAgentModels.ts";

test("parseCoderAgentModelId defaults to auto", () => {
  assert.equal(parseCoderAgentModelId(undefined), DEFAULT_CODER_AGENT_MODEL);
  assert.equal(parseCoderAgentModelId("opus"), "opus");
  assert.equal(parseCoderAgentModelId("fable"), "fable");
  assert.equal(parseCoderAgentModelId("haiku"), "haiku");
  assert.equal(parseCoderAgentModelId("gpt55"), "gpt55");
});

test("resolveCoderAgentApiModel maps ids to current API slugs", () => {
  assert.equal(resolveCoderAgentApiModel("sonnet"), "claude-sonnet-4-6");
  assert.equal(resolveCoderAgentApiModel("opus"), "claude-opus-4-8");
  assert.equal(resolveCoderAgentApiModel("fable"), "claude-fable-5");
  assert.equal(resolveCoderAgentApiModel("haiku"), "claude-haiku-4-5");
  assert.equal(resolveCoderAgentApiModel("gpt55"), "gpt-5.5");
});

test("resolveAutoCoderModel routes by prompt complexity", () => {
  assert.equal(resolveAutoCoderModel("fix typo in readme"), "haiku");
  assert.equal(resolveAutoCoderModel("refactor the auth module across the repo"), "opus");
  assert.equal(resolveAutoCoderModel("add a helper for parsing dates"), "sonnet");
});

test("resolveEffectiveCoderModelId resolves auto", () => {
  assert.equal(resolveEffectiveCoderModelId("auto", "quick rename"), "haiku");
  assert.equal(resolveEffectiveCoderModelId("sonnet"), "sonnet");
});

test("estimateCoderRunCostUsd scales with tokens", () => {
  const sonnet = estimateCoderRunCostUsd("sonnet", 10_000, 2_000);
  const opus = estimateCoderRunCostUsd("opus", 10_000, 2_000);
  assert.ok(opus > sonnet);
});

test("formatCoderRunUsageLine includes model and cost", () => {
  const line = formatCoderRunUsageLine({
    runId: "r1",
    modelId: "sonnet",
    apiModel: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    inputTokens: 12_400,
    outputTokens: 800,
    estimatedUsd: 0.05,
    updatedAt: Date.now(),
  });
  assert.match(line, /Sonnet 4.6/);
  assert.match(line, /est\./);
});
