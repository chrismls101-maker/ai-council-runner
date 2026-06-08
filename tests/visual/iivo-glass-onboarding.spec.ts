/**
 * IIVO Public Readiness — onboarding calibration flow
 */

import { test, expect } from "@playwright/test";
import { ensureAppRunning } from "./qaStepHelpers.js";

test.beforeAll(async () => {
  await ensureAppRunning();
});

test.describe("Glass onboarding calibration", () => {
  test("captures three open answers and dismisses after calibration", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto("/dashboard");
    await page.evaluate(() => {
      localStorage.removeItem("iivo_onboarding_v1_completed");
      localStorage.removeItem("iivo_glass_user_profile_v1");
    });
    await page.reload();
    await expect(page.getByTestId("onboarding-modal")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What's your name?" })).toBeVisible();

    await page.getByTestId("onboarding-input-name").fill("Jordan");
    await page.getByTestId("onboarding-next").click();

    await expect(page.getByRole("heading", { name: "What kind of work do you usually do?" })).toBeVisible();
    await page.getByTestId("onboarding-input-usualWork").fill("Product and operations leadership");
    await page.getByTestId("onboarding-next").click();

    await expect(page.getByRole("heading", { name: "What are you focused on right now?" })).toBeVisible();
    await page.getByTestId("onboarding-input-currentFocus").fill("Preparing a board update");
    await page.getByTestId("onboarding-finish").click();

    await expect(page.getByTestId("onboarding-calibrated")).toBeVisible();
    await expect(page.getByText("Glass is calibrated.")).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(() => localStorage.getItem("iivo_onboarding_v1_completed")),
    ).toBe("true");
    await expect(page.getByTestId("onboarding-modal")).not.toBeVisible({ timeout: 8000 });

    await page.reload();
    await expect(page.getByTestId("onboarding-modal")).not.toBeVisible();

    const stored = await page.evaluate(() =>
      localStorage.getItem("iivo_glass_user_profile_v1"),
    );
    expect(stored).toContain("Jordan");
    expect(stored).toContain("Product and operations leadership");
  });

  test("skip completes onboarding without profile", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/dashboard");
    await page.evaluate(() => {
      localStorage.removeItem("iivo_onboarding_v1_completed");
      localStorage.removeItem("iivo_glass_user_profile_v1");
    });
    await page.reload();
    await page.getByTestId("onboarding-skip").click();
    await expect(page.getByTestId("onboarding-modal")).not.toBeVisible();

    const stored = await page.evaluate(() =>
      localStorage.getItem("iivo_glass_user_profile_v1"),
    );
    expect(stored).toBeNull();
  });
});
