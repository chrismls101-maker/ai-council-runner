/**
 * Overnight QA — Electron E2E env + Playwright log parsing.
 * Keeps local overnight runs on real E2E; detects all-skipped false passes.
 */

/** @typedef {{ passed: number, failed: number, skipped: number, running: number | null, executed: number, allSkipped: boolean, noTestsExecuted: boolean }} PlaywrightE2eStats */

/**
 * Parse Playwright list-reporter output (supports glass-e2e-repeat multi-run logs).
 * @param {string} text
 * @returns {PlaywrightE2eStats}
 */
export function parsePlaywrightE2eOutput(text) {
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const line of text.split("\n")) {
    const m = line.match(/^\s+(?:[✓✘-]\s+)?(\d+)\s+(passed|failed|skipped)\b/);
    if (!m) continue;
    const n = Number(m[1]);
    if (m[2] === "passed") passed += n;
    else if (m[2] === "failed") failed += n;
    else skipped += n;
  }

  const runningMatches = [...text.matchAll(/Running (\d+) tests/g)];
  const running = runningMatches.length
    ? runningMatches.reduce((sum, m) => sum + Number(m[1]), 0)
    : null;

  const executed = passed + failed;
  const allSkipped = executed === 0 && skipped > 0;
  const noTestsExecuted =
    executed === 0 &&
    (skipped > 0 || (running != null && running > 0 && passed === 0 && failed === 0));

  return { passed, failed, skipped, running, executed, allSkipped, noTestsExecuted };
}

/**
 * Env for overnight E2E steps — never inject CI=1; force real Electron E2E locally.
 * @param {NodeJS.ProcessEnv} [baseEnv]
 */
export function buildE2eStepEnv(baseEnv = process.env) {
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...baseEnv, FORCE_COLOR: "0" };

  if (env.GLASS_OVERNIGHT_E2E_SKIP === "1") {
    return env;
  }

  env.GLASS_OVERNIGHT_E2E = "1";

  if (env.GLASS_E2E_FORCE !== "0") {
    env.GLASS_E2E_FORCE = "1";
  }

  if (env.GLASS_E2E_CI === "1") {
    env.GLASS_E2E_CI = "1";
  }

  return env;
}

/**
 * Env for non-E2E overnight steps — do not force CI=1.
 * @param {NodeJS.ProcessEnv} [baseEnv]
 * @param {{ category?: string }} [opts]
 */
export function buildStepEnv(baseEnv = process.env, opts = {}) {
  const category = opts.category ?? "general";
  if (category === "e2e" || category === "live-e2e") {
    return buildE2eStepEnv(baseEnv);
  }
  return { ...baseEnv, FORCE_COLOR: "0" };
}

/**
 * @param {{ exitCode: number | null, timedOut: boolean, logText: string, requireRealE2e?: boolean }} input
 * @returns {{ status: "pass" | "fail" | "timeout" | "e2e_skipped", parsed: PlaywrightE2eStats, reason?: string }}
 */
export function resolveE2eStepStatus({ exitCode, timedOut, logText, requireRealE2e = true }) {
  const parsed = parsePlaywrightE2eOutput(logText);

  if (timedOut) {
    return { status: "timeout", parsed, reason: "E2E step timed out" };
  }

  if (requireRealE2e && (parsed.allSkipped || parsed.noTestsExecuted)) {
    const ciSkip = /Skipped in CI by default|no GUI display is available/i.test(logText);
    return {
      status: "e2e_skipped",
      parsed,
      reason: ciSkip
        ? "Playwright skipped all Electron E2E tests (CI/no-display guard)"
        : `Playwright reported 0 executed tests (${parsed.skipped} skipped, exit ${exitCode})`,
    };
  }

  if (exitCode !== 0 || parsed.failed > 0) {
    return {
      status: "fail",
      parsed,
      reason: parsed.failed > 0 ? `${parsed.failed} Playwright test(s) failed` : `exit code ${exitCode}`,
    };
  }

  if (requireRealE2e && parsed.executed === 0) {
    return {
      status: "e2e_skipped",
      parsed,
      reason: "No Playwright tests executed in E2E log",
    };
  }

  return { status: "pass", parsed };
}

/**
 * @param {PlaywrightE2eStats} parsed
 * @param {"pass" | "fail" | "timeout" | "e2e_skipped"} status
 */
export function accumulateE2eStats(stats, parsed, status) {
  stats.e2eStepsAttempted = (stats.e2eStepsAttempted ?? 0) + 1;
  stats.e2eTestsExecuted = (stats.e2eTestsExecuted ?? 0) + parsed.executed;
  stats.e2eTestsSkipped = (stats.e2eTestsSkipped ?? 0) + parsed.skipped;
  stats.e2eTestExecutions = stats.e2eTestsExecuted;
  if (status === "e2e_skipped") {
    stats.e2eStepsAllSkipped = (stats.e2eStepsAllSkipped ?? 0) + 1;
  }
}
