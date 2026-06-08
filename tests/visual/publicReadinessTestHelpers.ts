/**
 * Public Readiness helpers — shared by Master QA and iivo-public-readiness.spec.ts patterns.
 */

import { expect, type Page } from "@playwright/test";
import { qaLog } from "./qaEnv.js";
import {
  assertComposerReadyForRun,
  assertNeutralPresetConfigured,
  installNeutralPresetInit,
} from "./qaPresetHelpers.js";
import { pauseQuick } from "./qaStepHelpers.js";

export const FORBIDDEN_CLAIMS = [
  "SOC 2",
  "HIPAA",
  "GDPR compliant",
  "data never trains",
  "enterprise-grade security",
  "fully private",
];

export interface PublicReadinessDiagnostics {
  url: string;
  onboardingVisible: boolean;
  landingComposerVisible: boolean;
  trustPanelVisible: boolean;
  settingsPanelVisible: boolean;
  readinessChecklistVisible: boolean;
  failedLocator?: string;
}

export async function collectPublicReadinessDiagnostics(
  page: Page,
  failedLocator?: string,
): Promise<PublicReadinessDiagnostics> {
  return {
    url: page.url(),
    onboardingVisible: await page
      .getByTestId("onboarding-modal")
      .isVisible()
      .catch(() => false),
    landingComposerVisible: await page
      .getByTestId("composer-input")
      .isVisible()
      .catch(() => false),
    trustPanelVisible: await page
      .getByTestId("provider-disclosure-section")
      .isVisible()
      .catch(() => false),
    settingsPanelVisible: await page
      .getByTestId("usage-credits-panel")
      .isVisible()
      .catch(() => false),
    readinessChecklistVisible: await page
      .getByTestId("public-readiness-checklist")
      .isVisible()
      .catch(() => false),
    failedLocator,
  };
}

/** Reset to landing-ready state after prior Master QA sections (conversation, panels). */
export async function preparePublicReadinessState(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("iivo_onboarding_v1_completed", "true");
    sessionStorage.removeItem("iivo-conversation-thread");
  });
  await installNeutralPresetInit(page);

  await page.goto("/dashboard");
  await pauseQuick(page, 500);

  const onboarding = page.getByTestId("onboarding-modal");
  if (await onboarding.isVisible().catch(() => false)) {
    qaLog("[Public Readiness] Dismissing onboarding modal");
    await page.getByTestId("onboarding-skip").click();
    await expect(onboarding).not.toBeVisible({ timeout: 10_000 });
  }

  const landingComposer = page.getByTestId("composer-input");
  if (!(await landingComposer.isVisible().catch(() => false))) {
    qaLog("[Public Readiness] Not on landing — clicking New Decision");
    const newDecision = page.getByTestId("new-decision-btn");
    await expect(newDecision).toBeVisible({ timeout: 15_000 });
    await newDecision.click();
    await pauseQuick(page, 400);
  }

  await expect(landingComposer).toBeVisible({ timeout: 15_000 });
  await assertComposerReadyForRun(page);
  await assertNeutralPresetConfigured(page);
  qaLog("[Public Readiness] Landing state ready");
}

export async function runPublicReadinessChecks(page: Page): Promise<void> {
  await preparePublicReadinessState(page);

  await expect(page.getByRole("heading", { name: "IIVO", level: 1 })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("composer-input")).toBeVisible();
  await page.getByTestId("composer-input").fill("What is IIVO?");
  await expect(page.getByTestId("composer-input")).toHaveValue("What is IIVO?");

  await page.getByTestId("sidebar-nav-trust").click();
  await expect(page.getByRole("heading", { name: "Trust & Privacy" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("provider-disclosure-section")).toBeVisible();
  await expect(page.getByTestId("public-readiness-checklist")).toBeVisible();

  const trustDisclosureText = await page.getByTestId("provider-disclosure-section").innerText();
  const dataUseText = await page.getByTestId("data-use-statement").innerText();
  for (const claim of FORBIDDEN_CLAIMS) {
    expect(trustDisclosureText.toLowerCase()).not.toContain(claim.toLowerCase());
    expect(dataUseText.toLowerCase()).not.toContain(claim.toLowerCase());
  }

  await page.getByTestId("sidebar-nav-settings").click();
  await expect(page.getByTestId("usage-credits-panel")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("usage-cost-table")).toBeVisible();
}
