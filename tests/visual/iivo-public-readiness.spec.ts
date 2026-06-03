/**
 * IIVO Visual QA — Public Readiness v1
 *
 * UI-only checks for onboarding, landing empty state, trust copy, and readiness checklist.
 * Does not call live AI providers.
 *
 * Requires: npm run dev (client :5173 + server :3001)
 */

import { test, expect } from "@playwright/test";
import { ensureAppRunning, pause } from "./qaStepHelpers.js";

const FORBIDDEN_CLAIMS = [
  "SOC 2",
  "HIPAA",
  "GDPR compliant",
  "data never trains",
  "enterprise-grade security",
  "fully private",
];

const READINESS_SECTIONS = [
  "product-clarity",
  "usage-protection",
  "memory-controls",
  "provider-disclosure",
  "error-handling",
  "benchmark-honesty",
  "export-delete",
  "beta-launch",
];

test.beforeAll(async () => {
  await ensureAppRunning();
});

test.describe("Public Readiness v1", () => {
  test("A — Onboarding flow", async ({ page }) => {
    test.setTimeout(90_000);

    await page.addInitScript(() => {
      localStorage.removeItem("iivo_onboarding_v1_completed");
    });

    await page.goto("/");
    await expect(page.getByTestId("onboarding-modal")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What is IIVO?" })).toBeVisible();

    await page.getByTestId("onboarding-next").click();
    await expect(page.getByRole("heading", { name: "How IIVO works" })).toBeVisible();

    await page.getByTestId("onboarding-next").click();
    await expect(page.getByRole("heading", { name: "Your workspace" })).toBeVisible();

    await page.getByTestId("onboarding-get-started").click();
    await expect(page.getByTestId("onboarding-modal")).not.toBeVisible();

    await page.reload();
    await expect(page.getByTestId("onboarding-modal")).not.toBeVisible();

    await page.getByTestId("sidebar-nav-settings").click();
    await page.getByTestId("reset-onboarding-btn").click();
    await page.reload();
    await expect(page.getByTestId("onboarding-modal")).toBeVisible();
    await page.getByTestId("onboarding-skip").click();
    await expect(page.getByTestId("onboarding-modal")).not.toBeVisible();
  });

  test("B — Empty state and prompt chips", async ({ page }) => {
    test.setTimeout(60_000);

    await page.addInitScript(() => {
      localStorage.setItem("iivo_onboarding_v1_completed", "true");
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "IIVO", level: 1 })).toBeVisible();
    await expect(page.getByText("INTELLIGENCE IN. VERIFIED ACTION OUT.")).toBeVisible();
    await expect(page.getByTestId("composer-input")).toBeVisible();
    await page.getByTestId("composer-input").fill("What is IIVO?");
    await expect(page.getByTestId("composer-input")).toHaveValue("What is IIVO?");
  });

  test("C — Trust & Privacy and Usage & Credits", async ({ page }) => {
    test.setTimeout(90_000);

    await page.addInitScript(() => {
      localStorage.setItem("iivo_onboarding_v1_completed", "true");
    });

    await page.goto("/");
    await page.getByTestId("sidebar-nav-trust").click();

    await expect(page.getByRole("heading", { name: "Trust & Privacy" })).toBeVisible();
    await expect(page.getByTestId("provider-disclosure-section")).toBeVisible();
    await expect(page.getByTestId("provider-disclosure-table")).toBeVisible();
    await expect(page.getByTestId("beta-workspace-label")).toContainText("Local Beta Workspace");

    const trustDisclosureText = await page.getByTestId("provider-disclosure-section").innerText();
    const dataUseText = await page.getByTestId("data-use-statement").innerText();
    for (const claim of FORBIDDEN_CLAIMS) {
      expect(trustDisclosureText.toLowerCase()).not.toContain(claim.toLowerCase());
      expect(dataUseText.toLowerCase()).not.toContain(claim.toLowerCase());
    }

    await page.getByTestId("sidebar-nav-settings").click();
    await expect(page.getByTestId("usage-credits-panel")).toBeVisible();
    await expect(page.getByTestId("usage-local-simulation-note")).toBeVisible();
    await expect(page.getByTestId("usage-cost-table")).toBeVisible();
    await expect(page.getByText(/Direct Answer: 1/i)).toBeVisible();

    const settingsDataUse = await page.locator(".settings-panel .panel-statement").innerText();
    for (const claim of FORBIDDEN_CLAIMS) {
      expect(settingsDataUse.toLowerCase()).not.toContain(claim.toLowerCase());
    }
  });

  test("D — Public Readiness Checklist", async ({ page }) => {
    test.setTimeout(60_000);

    await page.addInitScript(() => {
      localStorage.setItem("iivo_onboarding_v1_completed", "true");
    });

    await page.goto("/");
    await page.getByTestId("sidebar-nav-trust").click();
    await expect(page.getByTestId("public-readiness-checklist")).toBeVisible();

    for (const sectionId of READINESS_SECTIONS) {
      await expect(page.getByTestId(`readiness-section-${sectionId}`)).toBeVisible();
    }

    await pause(page, 300);
  });
});
