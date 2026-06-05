import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCENARIOS,
  SCENARIO_CATEGORIES,
  validateScenarioBank,
  shuffleWithSeed,
  getOrderedScenarios,
  getScenarioBatch,
  MODE_SCENARIO_LIMITS,
} from "../../scripts/qa-scenarios/iivo-glass-scenarios.mjs";

test("scenario bank has 100+ scenarios", () => {
  assert.ok(SCENARIOS.length >= 100, `got ${SCENARIOS.length}`);
});

test("scenario bank validates schema", () => {
  const v = validateScenarioBank();
  assert.equal(v.ok, true, v.errors.join("; "));
});

test("all categories have at least 5 scenarios", () => {
  for (const cat of SCENARIO_CATEGORIES) {
    const n = SCENARIOS.filter((s) => s.category === cat).length;
    assert.ok(n >= 5, `${cat} has ${n}`);
  }
});

test("no scenario requires manual unless marked", () => {
  for (const s of SCENARIOS) {
    if (!s.requiresManual) {
      assert.ok(s.passCriteria.length > 0, `${s.id} needs passCriteria`);
      assert.equal(typeof s.liveAllowed, "boolean");
    }
  }
});

test("seeded order is reproducible", () => {
  const a = getOrderedScenarios("deep", 42).map((s) => s.id);
  const b = getOrderedScenarios("deep", 42).map((s) => s.id);
  assert.deepEqual(a, b);
  const c = getOrderedScenarios("deep", 99).map((s) => s.id);
  assert.notDeepEqual(a, c);
});

test("shuffleWithSeed is deterministic", () => {
  const ids = SCENARIOS.map((s) => s.id);
  assert.deepEqual(shuffleWithSeed(ids, 7), shuffleWithSeed(ids, 7));
});

test("getScenarioBatch wraps when exhausted", () => {
  const ordered = getOrderedScenarios("quick", 1);
  const batch = getScenarioBatch(ordered, ordered.length - 2, 5);
  assert.equal(batch.length, 5);
});

test("mode limits enforce quick cap", () => {
  const q = getOrderedScenarios("quick", 1);
  assert.equal(q.length, MODE_SCENARIO_LIMITS.quick.maxScenarios);
});

test("video_learning scenarios labeled simulated unless fixture", () => {
  const sim = SCENARIOS.filter((s) => s.category === "video_learning" && !s.fixturePage);
  assert.ok(sim.every((s) => s.testKind === "simulated"));
  assert.ok(sim.every((s) => s.transcriptChunks.length > 0));
});

test("visual_ask scenarios use controlled fixtures", () => {
  const v = SCENARIOS.filter((s) => s.category === "visual_ask");
  assert.ok(v.every((s) => s.testKind === "controlled_visual_fixture"));
  assert.ok(v.every((s) => s.fixturePage));
});
