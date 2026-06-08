/**
 * IIVO Public Readiness — onboarding calibration flow
 *
 * Onboarding now lives in the IIVO Glass Electron app (see desktop-glass/GLASS_CONTRACT.md §2),
 * not in the web dashboard. These web UI tests are retired; run Glass E2E or manual QA instead.
 */

import { test, expect } from "@playwright/test";

test.describe("Glass onboarding calibration (retired — Electron-owned)", () => {
  test.skip(true, "Onboarding runs inside IIVO Glass Electron after boot splash, not in the browser.");

  test("captures three open answers and dismisses after calibration", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("onboarding-modal")).toBeVisible();
  });

  test("skip completes onboarding without profile", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId("onboarding-skip").click();
  });
});
