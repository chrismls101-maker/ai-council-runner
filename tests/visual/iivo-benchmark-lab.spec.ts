/**
 * IIVO Visual QA — Benchmark Lab v1 + Prompt Library
 *
 * Requires: npm run dev (client :5173 + server :3001)
 */

import { test, expect } from "@playwright/test";
import { pauseMs, qaLog } from "./qaEnv.js";
import {
  completeQaStep,
  initQaMonitor,
  markQaCheck,
  qaClick,
  showQaSuccess,
  updateQaMonitor,
} from "./qaMonitor.js";
import { API_BASE, ensureAppRunning, pauseQuick, runQaStep } from "./qaStepHelpers.js";
import { assertUsageResetToDefault } from "./usageCreditsApi.js";

const SIMPLE_CONTROL_PROMPT = "What is IIVO in one paragraph?";
const SMS_LIBRARY_PROMPT_ID = "sms-now-or-after-pilots";

test.beforeAll(async () => {
  console.warn("\n⚠️  Benchmark Lab live visual QA uses live API calls.\n");
  await ensureAppRunning();
});

test("Benchmark Lab prompt library UI (no live run)", async ({ page }) => {
  test.setTimeout(2 * 60 * 1000);

  await runQaStep(
    page,
    "Prompt library UI",
    async () => {
      await page.goto("/dashboard");
      await initQaMonitor(page, {
        title: "IIVO Benchmark Library QA",
        initialStep: "Prompt Library",
        initialStatus: "Verifying library UI",
      });
      await page.getByTestId("sidebar-nav-benchmark-lab").click();
      await expect(page.getByTestId("benchmark-lab-panel")).toBeVisible();
      await expect(page.getByTestId("benchmark-prompt-library")).toBeVisible();

      await page.getByTestId("benchmark-library-category-filter").selectOption("Product Decision");
      await page.getByTestId("benchmark-library-difficulty-filter").selectOption("hard");
      await expect(page.getByTestId(`benchmark-library-item-${SMS_LIBRARY_PROMPT_ID}`)).toBeVisible();

      await qaClick(
        page,
        page.getByTestId(`benchmark-select-prompt-${SMS_LIBRARY_PROMPT_ID}`),
        "Select SMS prompt",
      );

      await expect(page.getByTestId("benchmark-selected-prompt-meta")).toBeVisible();
      await expect(page.getByTestId("benchmark-success-criteria-list")).toBeVisible();
      await expect(page.getByTestId("benchmark-prompt-input")).toHaveValue(/SMS follow-up/i);

      await updateQaMonitor(page, {
        checks: [{ label: "Prompt library + SMS selection", state: "pass" }],
      });
      await completeQaStep(page, "Prompt library UI");
    },
    { failureHint: "estimate-guard" },
  );

  await showQaSuccess(page, ["Prompt library verified", "Hard SMS prompt selectable"], {
    statusMessage: "Benchmark Prompt Library UI verified",
  });
  await page.waitForTimeout(pauseMs(1500));
});

test("Benchmark Lab live flow (simple control prompt)", async ({ page }) => {
  test.setTimeout(8 * 60 * 1000);

  await runQaStep(
    page,
    "Setup",
    async () => {
      await assertUsageResetToDefault();
      await page.goto("/dashboard");
      await initQaMonitor(page, {
        title: "IIVO Benchmark QA",
        initialStep: "Benchmark Lab",
        initialStatus: "Opening Benchmark Lab",
      });
      await page.getByTestId("sidebar-nav-benchmark-lab").click();
      await expect(page.getByTestId("benchmark-lab-panel")).toBeVisible();
      await updateQaMonitor(page, {
        checks: [
          { label: "Benchmark Lab opened", state: "pass" },
          { label: "Baseline + IIVO answers", state: "pending" },
          { label: "Scores and winner", state: "pending" },
          { label: "Past benchmarks list", state: "pending" },
        ],
      });
    },
    { failureHint: "live" },
  );

  await runQaStep(
    page,
    "Run benchmark",
    async () => {
      await updateQaMonitor(page, {
        step: "Run benchmark",
        status: "Running live benchmark with simple control prompt",
        warning: "Live API — may take 1–4 minutes.",
      });

      await qaClick(
        page,
        page.getByTestId(`benchmark-select-prompt-simple-iivo-explanation`),
        "Select simple control prompt",
      );
      await expect(page.getByTestId("benchmark-prompt-input")).toHaveValue(SIMPLE_CONTROL_PROMPT);
      await pauseQuick(page, 500);
      await qaClick(page, page.getByTestId("benchmark-run-btn"), "Run benchmark");

      await expect(page.getByTestId("benchmark-lab-detail")).toBeVisible({ timeout: 240_000 });
      await expect(page.getByTestId("benchmark-baseline-answer")).toBeVisible();
      await expect(page.getByTestId("benchmark-iivo-answer")).toBeVisible();
      const baselineText = await page.getByTestId("benchmark-baseline-answer").innerText();
      const iivoText = await page.getByTestId("benchmark-iivo-answer").innerText();
      expect(baselineText.length).toBeGreaterThan(20);
      expect(iivoText.length).toBeGreaterThan(20);

      await expect(page.getByTestId("benchmark-winner")).toBeVisible();
      await expect(page.getByTestId("benchmark-score-diff")).not.toHaveText("");
      await expect(page.getByTestId("benchmark-value-verdict")).toBeVisible();
      await expect(page.getByTestId("benchmark-scoring-meta")).toBeVisible();

      const res = await fetch(`${API_BASE}/api/benchmarks`);
      const data = (await res.json()) as { runs: Array<{ id: string }> };
      expect(data.runs.length).toBeGreaterThan(0);
      qaLog(`Benchmark saved — ${data.runs.length} run(s) in store`);

      await markQaCheck(page, "Baseline + IIVO answers", "pass");
      await markQaCheck(page, "Scores and winner", "pass");
      await completeQaStep(page, "Run benchmark");
    },
    { failureHint: "live" },
  );

  await runQaStep(
    page,
    "Past benchmarks",
    async () => {
      await page.getByRole("button", { name: "← Back to Benchmark Lab" }).click();
      await expect(page.getByTestId("benchmark-runs-list")).toBeVisible();
      await expect(page.getByTestId("benchmark-runs-list").locator("li").first()).toBeVisible();

      await page.getByTestId("benchmark-runs-list").locator("button.benchmark-run-open").first().click();
      await expect(page.getByTestId("benchmark-compare-grid")).toBeVisible();
      await expect(page.getByTestId("benchmark-value-verdict")).toBeVisible();

      await markQaCheck(page, "Past benchmarks list", "pass");
      await completeQaStep(page, "Past benchmarks");
    },
    { failureHint: "estimate-guard" },
  );

  await showQaSuccess(page, ["Benchmark run saved", "Side-by-side comparison verified"], {
    statusMessage: "Benchmark Lab verified",
  });
  await page.waitForTimeout(pauseMs(3000));
});
