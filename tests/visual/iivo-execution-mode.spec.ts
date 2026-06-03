/**
 * Execution Mode Gate v1 — composer controls and mode persistence.
 */

import { test, expect } from "@playwright/test";
import {
  APP_URL,
  ensureAppRunning,
  openComposerConfigure,
  selectPillOption,
} from "./qaStepHelpers.js";
import { preparePublicReadinessState } from "./publicReadinessTestHelpers.js";

test.describe("Execution Mode composer", () => {
  test.beforeEach(async ({ page }) => {
    await ensureAppRunning();
    await page.goto(APP_URL);
    await preparePublicReadinessState(page);
  });

  test("primary composer shows Mode, Configure, context, Send — no legacy primary pills", async ({
    page,
  }) => {
    await expect(page.getByTestId("execution-mode-select")).toBeVisible();
    await expect(page.getByTestId("composer-configure")).toBeVisible();
    await expect(page.getByTestId("composer-send")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add context" })).toBeVisible();
    await expect(page.getByTestId("workflow-select")).not.toBeVisible();
    await expect(page.getByTestId("preset-select")).not.toBeVisible();
    await expect(page.getByTestId("auto-router-helper")).not.toBeVisible();
  });

  test("primary composer has no standalone Quick Mode or Auto Router buttons", async ({ page }) => {
    const toolbar = page.locator(".composer-toolbar-row").first();
    await expect(toolbar.getByRole("button", { name: /^Quick Mode$/i })).toHaveCount(0);
    await expect(toolbar.getByRole("button", { name: /^Auto Router$/i })).toHaveCount(0);
    await expect(page.getByTestId("execution-mode-control")).toBeVisible();
  });

  test("mode dropdown lists Auto, Quick, and Council with quick-by-default Auto description", async ({
    page,
  }) => {
    await selectPillOption(page, "execution-mode-select", "Auto");
    await expect(page.getByTestId("execution-mode-select")).toContainText(/Auto/i);
    await openComposerConfigure(page);
    await expect(page.getByTestId("execution-mode-description")).toContainText(/quick by default/i);
    await selectPillOption(page, "execution-mode-select", "Quick Mode");
    await selectPillOption(page, "execution-mode-select", "Council Mode");
  });

  test("preset and workflow override live inside Configure", async ({ page }) => {
    await openComposerConfigure(page);
    await expect(page.getByTestId("preset-select")).toBeVisible();
    await expect(page.getByTestId("advanced-routing")).toBeVisible();
    await page.getByTestId("advanced-routing").locator("summary").click();
    await expect(page.getByTestId("workflow-select")).toBeVisible();
    await expect(page.getByTestId("auto-router-helper")).toBeVisible();
  });

  test("selecting Quick Mode persists to localStorage", async ({ page }) => {
    await selectPillOption(page, "execution-mode-select", "Quick Mode");
    const stored = await page.evaluate(() => localStorage.getItem("iivo_execution_mode_v1"));
    expect(stored).toBe("quick");
  });
});
