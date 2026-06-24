import { test } from "node:test";
import assert from "node:assert/strict";
import { answerActivationHelp } from "../shared/activationHelp.ts";

test("answerActivationHelp matches billing questions", () => {
  const answer = answerActivationHelp("Does Glass charge me?");
  assert.match(answer, /doesn't charge/i);
  assert.match(answer, /Anthropic/i);
});

test("answerActivationHelp matches paste questions", () => {
  const answer = answerActivationHelp("Where do I paste the key?");
  assert.match(answer, /sk-ant-/i);
  assert.match(answer, /I'm ready/i);
});

test("answerActivationHelp falls back for unknown questions", () => {
  const answer = answerActivationHelp("xyzzy");
  assert.match(answer, /console\.anthropic\.com/i);
});
