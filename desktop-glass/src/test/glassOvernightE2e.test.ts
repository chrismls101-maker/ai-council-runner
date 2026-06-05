import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accumulateE2eStats,
  buildE2eStepEnv,
  buildStepEnv,
  parsePlaywrightE2eOutput,
  resolveE2eStepStatus,
} from "../../scripts/lib/glass-overnight-e2e.mjs";

const ALL_SKIPPED_LOG = `
Running 28 tests using 1 worker
  -   1 tests/e2e/glass-copilot.spec.ts:46:1 › Session Copilot is off on launch
  28 skipped
[glass-e2e-repeat] 1/1 passed
`;

const REAL_PASS_LOG = `
Running 28 tests using 1 worker
  27 passed (45s)
  1 skipped
[glass-e2e-repeat] 1/1 passed
`;

const CI_SKIP_LOG = `
Skipped in CI by default (standard runners lack GUI automation).
Running 28 tests using 1 worker
  28 skipped
`;

test("parsePlaywrightE2eOutput detects all-skipped overnight false pass", () => {
  const p = parsePlaywrightE2eOutput(ALL_SKIPPED_LOG);
  assert.equal(p.passed, 0);
  assert.equal(p.failed, 0);
  assert.equal(p.skipped, 28);
  assert.equal(p.executed, 0);
  assert.equal(p.allSkipped, true);
  assert.equal(p.noTestsExecuted, true);
});

test("parsePlaywrightE2eOutput counts real passes and partial skips", () => {
  const p = parsePlaywrightE2eOutput(REAL_PASS_LOG);
  assert.equal(p.passed, 27);
  assert.equal(p.skipped, 1);
  assert.equal(p.executed, 27);
  assert.equal(p.allSkipped, false);
});

test("parsePlaywrightE2eOutput sums multi-run repeat logs", () => {
  const p = parsePlaywrightE2eOutput(`${REAL_PASS_LOG}\n${REAL_PASS_LOG}`);
  assert.equal(p.passed, 54);
  assert.equal(p.executed, 54);
});

test("resolveE2eStepStatus marks all-skipped exit-0 as e2e_skipped", () => {
  const r = resolveE2eStepStatus({
    exitCode: 0,
    timedOut: false,
    logText: ALL_SKIPPED_LOG,
    requireRealE2e: true,
  });
  assert.equal(r.status, "e2e_skipped");
  assert.match(r.reason ?? "", /0 executed|skipped/i);
});

test("resolveE2eStepStatus passes when tests actually ran", () => {
  const r = resolveE2eStepStatus({
    exitCode: 0,
    timedOut: false,
    logText: REAL_PASS_LOG,
    requireRealE2e: true,
  });
  assert.equal(r.status, "pass");
  assert.equal(r.parsed.executed, 27);
});

test("resolveE2eStepStatus detects CI guard skip reason", () => {
  const r = resolveE2eStepStatus({
    exitCode: 0,
    timedOut: false,
    logText: CI_SKIP_LOG + ALL_SKIPPED_LOG,
    requireRealE2e: true,
  });
  assert.equal(r.status, "e2e_skipped");
  assert.match(r.reason ?? "", /CI|no-display/i);
});

test("buildE2eStepEnv forces real E2E without injecting CI=1", () => {
  const env = buildE2eStepEnv({ FOO: "bar" });
  assert.equal(env.CI, undefined);
  assert.equal(env.GLASS_E2E_FORCE, "1");
  assert.equal(env.GLASS_OVERNIGHT_E2E, "1");
});

test("buildE2eStepEnv preserves inherited CI but still forces GLASS_E2E_FORCE", () => {
  const env = buildE2eStepEnv({ CI: "1", FOO: "bar" });
  assert.equal(env.CI, "1");
  assert.equal(env.GLASS_E2E_FORCE, "1");
});

test("buildE2eStepEnv respects GLASS_OVERNIGHT_E2E_SKIP for intentional CI skip", () => {
  const env = buildE2eStepEnv({ GLASS_OVERNIGHT_E2E_SKIP: "1", CI: "1" });
  assert.equal(env.GLASS_OVERNIGHT_E2E, undefined);
  assert.equal(env.GLASS_E2E_FORCE, undefined);
});

test("buildStepEnv only forces E2E flags for e2e categories", () => {
  const general = buildStepEnv({ CI: "1" }, { category: "general" });
  assert.equal(general.GLASS_E2E_FORCE, undefined);
  assert.equal(general.FORCE_COLOR, "0");

  const e2e = buildStepEnv({ CI: "1" }, { category: "e2e" });
  assert.equal(e2e.GLASS_E2E_FORCE, "1");
});

test("accumulateE2eStats tracks executed vs all-skipped steps", () => {
  const stats: Record<string, number> = {};
  accumulateE2eStats(stats, parsePlaywrightE2eOutput(REAL_PASS_LOG), "pass");
  assert.equal(stats.e2eStepsAttempted, 1);
  assert.equal(stats.e2eTestsExecuted, 27);
  assert.equal(stats.e2eTestsSkipped, 1);
  assert.equal(stats.e2eStepsAllSkipped ?? 0, 0);

  accumulateE2eStats(stats, parsePlaywrightE2eOutput(ALL_SKIPPED_LOG), "e2e_skipped");
  assert.equal(stats.e2eStepsAttempted, 2);
  assert.equal(stats.e2eStepsAllSkipped, 1);
});
