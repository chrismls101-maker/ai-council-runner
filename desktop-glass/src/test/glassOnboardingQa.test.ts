import assert from "node:assert/strict";
import { answerGlassOnboardingQuestion } from "../shared/glassOnboardingQa.ts";

assert.match(
  answerGlassOnboardingQuestion("what is a power stack"),
  /power stack/i,
);
assert.match(
  answerGlassOnboardingQuestion("What is a power stack?"),
  /power stack/i,
);
assert.doesNotMatch(
  answerGlassOnboardingQuestion("what is a power stack"),
  /fetch failed/i,
);
assert.match(
  answerGlassOnboardingQuestion("how is this different from ChatGPT"),
  /ChatGPT/i,
);

console.log("glassOnboardingQa.test.ts — ok");
