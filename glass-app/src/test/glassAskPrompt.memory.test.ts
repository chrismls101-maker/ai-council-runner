import { test } from "node:test";
import assert from "node:assert/strict";
import { passiveContextForAsk } from "../main/glassAskPrompt.ts";

const SEED = `User context (Glass calibration — seed, local only):
Name: Alex
Kind of work: Product design`;

const DERIVED = `User context (inferred from recent Glass interactions — local only):
Role tendency: builder`;

test("passiveContextForAsk drops onboarding seed when memory profile exists", () => {
  const memory = {
    userProfile: "- Name: Alex",
    relevantMemories: "",
    tokenCount: 4,
  };
  assert.equal(passiveContextForAsk(SEED, memory), undefined);
});

test("passiveContextForAsk keeps derived context when memory profile exists", () => {
  const memory = {
    userProfile: "- Name: Alex",
    relevantMemories: "",
    tokenCount: 4,
  };
  assert.equal(passiveContextForAsk(DERIVED, memory), DERIVED);
});

test("passiveContextForAsk strips seed but keeps terminal when memory profile exists", () => {
  const memory = {
    userProfile: "- Name: Alex",
    relevantMemories: "",
    tokenCount: 4,
  };
  const combined = `${SEED}\n\n[Terminal: npm test failed]`;
  assert.equal(passiveContextForAsk(combined, memory), "[Terminal: npm test failed]");
});

test("passiveContextForAsk passes seed through when no memory profile", () => {
  assert.equal(
    passiveContextForAsk(SEED, { userProfile: "", relevantMemories: "", tokenCount: 0 }),
    SEED,
  );
});
