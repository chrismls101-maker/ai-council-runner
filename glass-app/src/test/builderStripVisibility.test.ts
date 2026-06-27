import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldShowBuilderStrip } from "../shared/builderStripVisibility.ts";

test("builder strip shows for developer after onboarding", () => {
  assert.equal(
    shouldShowBuilderStrip({ onboardingComplete: true, persona: "developer" }),
    true,
  );
});

test("builder strip shows for general persona when public Aletheia flag is on", () => {
  assert.equal(
    shouldShowBuilderStrip({ onboardingComplete: true, persona: "general" }),
    true,
  );
  assert.equal(
    shouldShowBuilderStrip({ onboardingComplete: true, persona: "operator" }),
    true,
  );
});

test("builder strip hidden for non-developer when public Aletheia flag is off", () => {
  assert.equal(
    shouldShowBuilderStrip({
      onboardingComplete: true,
      persona: "operator",
      aletheiaStripForAllPersonas: false,
    }),
    false,
  );
});

test("builder strip shows in dev after onboarding even without persona", () => {
  assert.equal(
    shouldShowBuilderStrip({ onboardingComplete: true, glassDevMode: true }),
    true,
  );
});

test("builder strip hidden during onboarding", () => {
  assert.equal(
    shouldShowBuilderStrip({ onboardingComplete: false, glassDevMode: true }),
    false,
  );
});
