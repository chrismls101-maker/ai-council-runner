import assert from "node:assert/strict";
import { scoreGlassAnswerQuality } from "./glass-answer-quality.mjs";

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`✓ ${name}`))
    .catch((err) => {
      console.error(`✗ ${name}`);
      throw err;
    });
}

await test("detects council formatting", () => {
  const flags = scoreGlassAnswerQuality({
    answer: "Here is help.\nFinal Action Plan\n- do thing",
    contextSummary: "strategy doc",
  });
  assert.equal(flags.council_formatting, true);
});

await test("marks context-specific when tokens match", () => {
  const flags = scoreGlassAnswerQuality({
    answer: "Fix VITE_SUPABASE_URL in your .env before deploy.",
    contextSummary: "Terminal: Missing VITE_SUPABASE_URL",
  });
  assert.equal(flags.context_specific, true);
});

await test("detects cannot see errors", () => {
  const flags = scoreGlassAnswerQuality({
    answer: "I can't see your screen without a capture.",
    contextSummary: "fixture page",
  });
  assert.equal(flags.cannot_see_error, true);
});

console.log("glass-answer-quality.test.mjs: all assertions passed");
