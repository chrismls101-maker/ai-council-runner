/**
 * IIVO Glass — Sorting Hat onboarding E2E
 *
 * Verifies the first-launch Sorting Hat flow:
 *   1. Force-open via e2e-open-sorting-hat (E2E mode skips onboarding on boot)
 *   2. Overlay renders Sorting Hat with skip + input
 *   3. Skip marks onboardingComplete and dismisses overlay
 *   4. Name step appears after fast manifest (IIVO_GLASS_E2E shortens delays)
 *   5. Recalibrate from panel re-opens Sorting Hat
 *
 * Run: npm run glass:e2e -- --grep "IIVO Glass Sorting Hat"
 */

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import {
  closeGlassApp,
  getGlassWindows,
  getElectronE2eSkipReason,
  GLASS_ELECTRON_BIN,
  GLASS_MAIN,
  launchGlassApp,
  openPanelTab,
  readGlassState,
  type LaunchedGlass,
} from "./helpers/electronApp.ts";
import { logE2eFailureDiagnostics } from "./helpers/e2eFailureDiagnostics.ts";

let app: LaunchedGlass;
let commandPage: import("@playwright/test").Page;

test.beforeAll(async () => {
  const skipReason = getElectronE2eSkipReason();
  test.skip(!!skipReason, skipReason ?? undefined);

  if (!fs.existsSync(GLASS_MAIN)) {
    throw new Error("Glass main bundle missing. Run `npm run build --prefix desktop-glass`.");
  }
  if (!fs.existsSync(GLASS_ELECTRON_BIN)) {
    throw new Error("Electron binary missing. Run `npm install --prefix desktop-glass`.");
  }

  app = await launchGlassApp();
  commandPage = (await getGlassWindows(app.browser)).command;
});

test.afterAll(async () => {
  if (app) await closeGlassApp(app);
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await logE2eFailureDiagnostics(app, commandPage, testInfo.title);
  }
  try {
    await commandPage.evaluate(() =>
      window.glass.send({ type: "glass-onboarding-skip" }),
    );
    await commandPage.waitForFunction(
      () => window.glass.getState().onboardingComplete === true,
      { timeout: 8_000 },
    );
  } catch {
    /* best-effort cleanup */
  }
});

async function openSortingHat(): Promise<void> {
  await commandPage.evaluate(() =>
    window.glass.send({ type: "e2e-open-sorting-hat" }),
  );
}

async function getOverlay(): Promise<import("@playwright/test").Page> {
  return (await getGlassWindows(app.browser)).overlay;
}

test.describe("IIVO Glass Sorting Hat", () => {
  test("Sorting Hat renders when opened via E2E hook", async () => {
    test.setTimeout(60_000);

    await openSortingHat();
    const overlay = await getOverlay();

    await expect(overlay.locator('[data-testid="sorting-hat-screen"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(overlay.locator('[data-testid="sorting-hat-skip"]')).toBeVisible();

    const state = await readGlassState(commandPage);
    expect(state.onboardingComplete).toBe(false);
  });

  test("Skip dismisses Sorting Hat and marks onboarding complete", async () => {
    test.setTimeout(60_000);

    await openSortingHat();
    const overlay = await getOverlay();
    await expect(overlay.locator('[data-testid="sorting-hat-screen"]')).toBeVisible({
      timeout: 10_000,
    });

    await overlay.locator('[data-testid="sorting-hat-skip"]').click();

    await commandPage.waitForFunction(
      () => window.glass.getState().onboardingComplete === true,
      { timeout: 8_000 },
    );

    await expect(overlay.locator('[data-testid="sorting-hat-screen"]')).toBeHidden({
      timeout: 5_000,
    });
  });

  test("name input appears after fast manifest", async () => {
    test.setTimeout(90_000);

    await openSortingHat();
    const overlay = await getOverlay();
    await expect(overlay.locator('[data-testid="sorting-hat-screen"]')).toBeVisible({
      timeout: 10_000,
    });

    const nameInput = overlay.locator('[data-testid="sorting-hat-input"]');
    await expect(nameInput).toBeVisible({ timeout: 25_000 });
    await nameInput.fill("Alex Glass");

    const submit = overlay.locator('[data-testid="sorting-hat-submit"]');
    await expect(submit).toBeEnabled();
  });

  test("recalibrate from panel re-opens Sorting Hat", async () => {
    test.setTimeout(90_000);

    await commandPage.evaluate(() =>
      window.glass.send({ type: "glass-onboarding-skip" }),
    );
    await commandPage.waitForFunction(
      () => window.glass.getState().onboardingComplete === true,
      { timeout: 8_000 },
    );

    const { dock, panel } = await getGlassWindows(app.browser);
    await dock.locator('[data-testid="glass-dock-open-panel"]').click();
    await openPanelTab(panel, "setup");
    await expect(panel.locator('[data-testid="glass-panel-profile-section"]')).toBeVisible({
      timeout: 8_000,
    });
    await panel.locator('[data-testid="glass-panel-recalibrate-persona"]').click();

    const overlay = await getOverlay();
    await expect(overlay.locator('[data-testid="sorting-hat-screen"]')).toBeVisible({
      timeout: 10_000,
    });

    const state = await readGlassState(commandPage);
    expect(state.onboardingComplete).toBe(false);
  });
});
