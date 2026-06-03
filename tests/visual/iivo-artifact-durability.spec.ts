/**
 * Artifact durability — reference restore, fallback UI, composer layout.
 */

import { test, expect } from "@playwright/test";
import {
  APP_URL,
  ensureAppRunning,
  openComposerConfigure,
} from "./qaStepHelpers.js";
import { assertComposerReadyForRun } from "./qaPresetHelpers.js";
import { preparePublicReadinessState } from "./publicReadinessTestHelpers.js";

test.describe("Artifact durability", () => {
  test.beforeEach(async ({ page }) => {
    await ensureAppRunning();
    await page.goto(APP_URL);
    await preparePublicReadinessState(page);
  });

  test("composer and configure are ready for artifact runs", async ({ page }) => {
    await assertComposerReadyForRun(page);
    await expect(page.getByTestId("composer-send")).toBeVisible();

    await openComposerConfigure(page);
    await expect(page.getByTestId("preset-select")).toBeVisible();
    await expect(page.getByTestId("preset-select")).toContainText(/No preset/i);
    await expect(page.getByTestId("advanced-routing")).toBeVisible();
    await page.getByTestId("advanced-routing").locator("summary").click();
    await expect(page.getByTestId("workflow-select")).toBeVisible();
  });

  test("artifact reference missing UI does not crash page", async ({ page }) => {
    await page.evaluate(() => {
      const turns = [
        {
          id: "fake-turn",
          submittedAt: new Date().toISOString(),
          userPrompt: "Build a landing page",
          submittedAttachments: [],
          status: "complete",
          runId: "nonexistent-run-id",
          outputs: {
            strategy: "Hi — here is draft copy.",
            critic: "",
            research: "",
            salesWriter: "",
            finalJudge: "Hi — here is draft copy.",
          },
          agentMeta: {},
          agentCosts: {},
          costSummary: null,
          runStatus: "complete",
          workflowName: "Direct Answer",
          workflow: "auto",
          tokenMode: "small",
          routerDecision: null,
          errors: [],
          benchmarkAnswer: null,
          benchmarkCost: null,
          benchmarkChecks: {},
          benchmarkNotes: "",
          executionTrace: null,
          artifactSnapshot: {
            mode: "reference",
            artifactId: "nonexistent-run-id",
            title: "Missing artifact",
            type: "canvas_project",
            renderMode: "canvas",
            sizeBytes: 50000,
          },
        },
      ];
      sessionStorage.setItem("iivo-conversation-thread", JSON.stringify(turns));
    });
    await page.reload();
    await expect(page.getByTestId("artifact-reference-missing")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("final-answer")).toBeVisible();
  });
});
