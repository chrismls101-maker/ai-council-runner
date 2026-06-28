/**
 * Public Glass landing at / — optional password gate + marketing page.
 */

import { test, expect } from "@playwright/test";
import { ensureAppRunning } from "./qaStepHelpers.js";

test.beforeAll(async () => {
  await ensureAppRunning();
});

test.describe("Glass public landing", () => {
  test("shows marketing page when gate is disabled", async ({ page }) => {
    await page.route("**/api/landing-gate/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ enabled: false }),
      });
    });
    await page.route("**/api/landing/glass-browse/social-proof", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, entered: 11, demoEnabled: true }),
      });
    });

    await page.goto("/?skipIntro=1");
    await expect(page.getByTestId("glass-public-landing")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("glass-safari-window")).toBeVisible();
    await expect(page.getByRole("heading", { name: "IIVO Glass" })).toBeVisible();
    await expect(page.getByTestId("glass-landing-download").first()).toBeVisible();
    await expect(page.getByTestId("glass-browse-overlay")).toBeVisible({ timeout: 5000 });
  });

  test("shows password gate with reveal toggle when enabled", async ({ page }) => {
    await page.route("**/api/landing-gate/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ enabled: true }),
      });
    });

    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("iivo_landing_gate_unlocked"));

    await expect(page.getByTestId("glass-landing-gate")).toBeVisible({ timeout: 15_000 });
    const password = page.getByTestId("landing-gate-password");
    await expect(password).toHaveAttribute("type", "password");
    await password.fill("preview-secret");
    await page.getByTestId("landing-gate-password-reveal").click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("preview-secret");
  });
});
