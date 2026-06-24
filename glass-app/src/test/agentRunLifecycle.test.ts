import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentRunCancelled,
  agentRunDone,
  agentRunError,
  isRecoverableCoderError,
} from "../main/agentRunLifecycle.ts";
import {
  consumeChainResearchBootstrap,
  pendingChainResearchSessionCount,
  storeChainResearchFix,
  clearChainResearchContext,
} from "../main/agentChainContext.ts";

test("isRecoverableCoderError classifies infrastructure vs coding failures", () => {
  assert.equal(isRecoverableCoderError("Type error in src/foo.ts line 12"), true);
  assert.equal(isRecoverableCoderError("No Anthropic API key found"), false);
  assert.equal(isRecoverableCoderError("Network error: fetch failed"), false);
  assert.equal(isRecoverableCoderError("Agent exceeded maximum loop iterations"), false);
});

test("agentRunError defaults recoverable from error text", () => {
  const rec = agentRunError("Build failed: npm run typecheck exit 1");
  assert.equal(rec.outcome, "error");
  assert.equal(rec.recoverable, true);

  const infra = agentRunError("OpenAI API key not found");
  assert.equal(infra.recoverable, false);
});

test("agentRunDone and agentRunCancelled outcomes", () => {
  assert.equal(agentRunDone("ok", "/tmp/out.md").outcome, "done");
  assert.equal(agentRunCancelled().outcome, "cancelled");
});

test("storeChainResearchFix is consumed once per session", () => {
  clearChainResearchContext();
  storeChainResearchFix("default", "Fix: add null check", "corr-1", "/tmp/r.md");
  assert.equal(pendingChainResearchSessionCount(), 1);
  const text = consumeChainResearchBootstrap("default");
  assert.match(text ?? "", /Prior automated research/);
  assert.match(text ?? "", /null check/);
  assert.equal(consumeChainResearchBootstrap("default"), undefined);
  assert.equal(pendingChainResearchSessionCount(), 0);
});
