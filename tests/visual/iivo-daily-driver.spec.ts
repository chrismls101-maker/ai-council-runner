/**
 * IIVO Daily Driver Simulation — broad real-world friction testing + Agent Mind.
 *
 * Modes:
 * - npm run qa:daily — 10 default general scenarios
 * - npm run qa:daily:full — full catalog (~55+)
 * - npm run qa:daily:live — live vision + outcome flows
 * - npm run qa:daily:watch — slower pacing + visible Agent Mind panel
 */

import { test, expect } from "@playwright/test";
import { DailyDriverAgentMind } from "./dailyDriverAgentMind.js";
import { DailyDriverReport } from "./dailyDriverReport.js";
import { runDailyDriverScenario } from "./dailyDriverRunner.js";
import {
  getDefaultScenarioIds,
  getScenarioMixStats,
  getScenariosForRun,
  isDailyQaLive,
  isDailyQaFull,
} from "./dailyDriverScenarios.js";
import {
  ensureDailyDriverQaMonitor,
  initDailyDriverQaMonitor,
  registerDailyDriverMonitorPersistence,
} from "./dailyDriverQaMonitor.js";
import { assertEnvironmentReady, checkEnvironmentHealth } from "./masterQaHealth.js";
import { qaLog } from "./qaEnv.js";
import { installNeutralPresetInit } from "./qaPresetHelpers.js";
import { ensureAppRunning } from "./qaStepHelpers.js";

const scenarios = getScenariosForRun();
const mode = isDailyQaLive() ? "live" : isDailyQaFull() ? "full" : "default";
const report = new DailyDriverReport();

test.beforeAll(async () => {
  await ensureAppRunning();
  const health = await checkEnvironmentHealth();
  assertEnvironmentReady(health);
  const mix = getScenarioMixStats();
  qaLog(`═══ Daily Driver mode=${mode} — ${scenarios.length} scenario(s) ═══`);
  qaLog(
    `Catalog: ${mix.total} scenarios — ${mix.generalPct}% general (${mix.general}), ${mix.iivoPct}% IIVO (${mix.iivo})`,
  );
  if (mode === "default") {
    qaLog(
      `Default pack (${getDefaultScenarioIds().length}): ${getDefaultScenarioIds().join(", ")} — ${mix.defaultGeneral} general, ${mix.defaultIivo} IIVO`,
    );
  }
});

test.describe("IIVO Daily Driver Simulation", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("iivo_onboarding_v1_completed", "true");
      sessionStorage.removeItem("iivo-conversation-thread");
    });
    await installNeutralPresetInit(page);
    await registerDailyDriverMonitorPersistence(page, { totalScenarios: scenarios.length });
    await initDailyDriverQaMonitor(page, { totalScenarios: scenarios.length, report });
  });

  test("Agent Mind panel is visible", async ({ page }) => {
    await page.goto("/dashboard");
    await ensureDailyDriverQaMonitor(page, { totalScenarios: scenarios.length, report });
    await expect(page.getByTestId("visual-qa-monitor")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("daily-agent-mind-panel")).toBeVisible();
    await expect(page.getByTestId("daily-agent-scenario-label")).toBeVisible();
  });

  let scenarioNum = 0;
  for (const scenario of scenarios) {
    const tagLabel = scenario.tags.join(" ");
    test(`[${tagLabel}] ${scenario.id} — ${scenario.title}`, async ({ page }) => {
      scenarioNum += 1;
      test.setTimeout(scenario.maxSeconds * 1000 + 90_000);
      const agent = new DailyDriverAgentMind(page, report);
      await runDailyDriverScenario(page, scenario, report, agent, scenarioNum, scenarios.length);
    });
  }
});

test.afterAll(async () => {
  const path = await report.writeJsonReport(mode);
  report.printTerminalSummary(path, mode);

  const failed = report.results.filter((r) => r.outcome === "fail");
  if (failed.length > 0) {
    throw new Error(`Daily Driver failed scenarios: ${failed.map((f) => f.id).join(", ")}`);
  }
});
