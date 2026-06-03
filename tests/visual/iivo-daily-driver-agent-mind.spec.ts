/**
 * Daily Driver Agent Mind panel — overlay smoke + friction detection units.
 */

import { test, expect } from "@playwright/test";
import { DailyDriverAgentMind } from "./dailyDriverAgentMind.js";
import { DailyDriverReport } from "./dailyDriverReport.js";
import { DAILY_DRIVER_SCENARIOS } from "./dailyDriverScenarios.js";
import {
  ensureDailyDriverQaMonitor,
  registerDailyDriverMonitorPersistence,
} from "./dailyDriverQaMonitor.js";
import { preparePublicReadinessState } from "./publicReadinessTestHelpers.js";
import { installNeutralPresetInit } from "./qaPresetHelpers.js";
import { ensureAppRunning } from "./qaStepHelpers.js";

test.beforeAll(async () => {
  await ensureAppRunning();
});

test("Agent Mind panel visible after navigation and reattach", async ({ page }) => {
  const report = new DailyDriverReport();
  await page.addInitScript(() => {
    localStorage.setItem("iivo_onboarding_v1_completed", "true");
  });
  await installNeutralPresetInit(page);
  await registerDailyDriverMonitorPersistence(page, { totalScenarios: 1 });
  await page.goto("/");
  await ensureDailyDriverQaMonitor(page, { totalScenarios: 1, report });

  await expect(page.getByTestId("daily-agent-mind-panel")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("daily-agent-scenario-label")).toBeVisible();

  await preparePublicReadinessState(page);
  await ensureDailyDriverQaMonitor(page, { totalScenarios: 1, report });

  await expect(page.getByTestId("daily-agent-mind-panel")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("visual-qa-monitor")).toBeVisible();
  expect(report.agentVisibility.panelInitialized).toBe(true);
});

test("Agent Mind panel updates plan, timeline, and evaluation fields", async ({ page }) => {
  const report = new DailyDriverReport();
  await page.addInitScript(() => {
    localStorage.setItem("iivo_onboarding_v1_completed", "true");
  });
  await installNeutralPresetInit(page);
  await page.goto("/");
  await ensureDailyDriverQaMonitor(page, { totalScenarios: 1, report });

  const panel = page.getByTestId("daily-agent-mind-panel");
  await expect(panel).toBeVisible({ timeout: 15_000 });

  const scenario = DAILY_DRIVER_SCENARIOS.find((s) => s.id === "founder-saas-1500-14days")!;
  const agent = new DailyDriverAgentMind(page, report);
  agent.setRunBounds(1, 1);
  await agent.planScenario(scenario);
  await agent.action(scenario, "Smoke test action");
  await agent.evaluate(scenario, "Smoke evaluation — useful answer expected.");
  await agent.friction(scenario, "none", "Answer matched the scenario goal.");

  await expect(page.getByTestId("daily-agent-current-plan")).toContainText(/SaaS|1,500|validate/i);
  await expect(page.getByTestId("daily-agent-current-evaluation")).toContainText(/Smoke evaluation/i);
  await expect(page.getByTestId("daily-agent-friction")).toBeVisible();
  await expect(page.getByTestId("daily-agent-timeline")).toContainText(/Planning scenario/i);

  expect(report.agentMindTranscript.length).toBeGreaterThan(2);
  expect(report.agentMindTranscript.some((e) => e.type === "plan")).toBe(true);
  expect(report.agentMindTranscript.some((e) => e.type === "evaluation")).toBe(true);
});

test("Agent Mind report includes transcript paths", async () => {
  const report = new DailyDriverReport();
  report.appendAgentMindEvent({
    timestamp: new Date().toISOString(),
    scenarioId: "test",
    scenarioTitle: "Test",
    type: "plan",
    message: "Planning",
  });
  report.appendAutoIssues([
    {
      scenarioId: "ecommerce-jewelry-conversion",
      type: "memory_bleed",
      severity: "blocker",
      evidence: "AI Front Desk",
      agentMessage: "I found AI Front Desk in an unrelated ecommerce answer.",
    },
  ]);
  const json = report.toJson("default");
  expect(json.agentMindTranscript.length).toBeGreaterThan(0);
  expect(json.autoDetectedIssues.length).toBe(1);
});
