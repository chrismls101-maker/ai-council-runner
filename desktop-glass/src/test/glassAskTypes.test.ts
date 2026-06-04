import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatOverlayAnswerText,
  shouldUseCouncilMode,
} from "../shared/glassAskTypes.ts";

test("shouldUseCouncilMode defaults to quick", () => {
  assert.equal(shouldUseCouncilMode("What am I working on?"), "quick");
});

test("shouldUseCouncilMode detects council prompts", () => {
  assert.equal(shouldUseCouncilMode("Analyze my go-to-market strategy"), "council");
});

test("shouldUseCouncilMode honors explicit mode", () => {
  assert.equal(shouldUseCouncilMode("hello", "quick"), "quick");
  assert.equal(shouldUseCouncilMode("hello", "council"), "council");
});

test("formatOverlayAnswerText strips markdown headers", () => {
  const out = formatOverlayAnswerText("## Summary\n- one\n- two");
  assert.doesNotMatch(out, /^##/);
  assert.match(out, /- one/);
});
