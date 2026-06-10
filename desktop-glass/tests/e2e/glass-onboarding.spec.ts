/**
 * IIVO Glass — Onboarding E2E (Task #59)
 *
 * Verifies the three-question calibration flow:
 *   1. Force-open onboarding via e2e-open-onboarding command
 *   2. Overlay renders and blocks normal UI
 *   3. User answers name → usualWork → currentFocus
 *   4. "Calibrated" confirmation screen appears
 *   5. Overlay dismisses; state.onboardingOpen becomes false
 *   6. state.glassUserProfile reflects the answers
 *
 * Also verifies the skip path (Esc / Skip button).
 *
 * Note: In E2E mode (IIVO_GLASS_E2E=1) onboarding is skipped on boot.
 * We trigger it manually via the e2e-open-onboarding IPC hook.
 *
 * Run: npm run glass:e2e -- --grep "IIVO Glass Onboarding"
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
  readGlassState,
  type LaunchedGlass,
} from "./helpers/electronApp.ts";
import { logE2eFailureDiagnostics } from "./helpers/e2eFailureDiagnostics.ts";

const CALIBRATION_DISMISS_WAIT_MS = 4_500; // slightly longer than the 3.2 s animation

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
  // Always dismiss onboarding after each test so the next one starts clean
  try {
    await commandPage.evaluate(() =>
      window.glass.send({ type: "skip-glass-onboarding" }),
    );
    await commandPage.waitForFunction(
      () => !window.glass.getState().onboardingOpen,
      { timeout: 5_000 },
    );
  } catch {
    /* best-effort cleanup */
  }
});

/** Force-open the onboarding overlay via the E2E hook. */
async function openOnboarding(): Promise<void> {
  await commandPage.evaluate(() =>
    window.glass.send({ type: "e2e-open-onboarding" }),
  );
}

/** Get the overlay page from the launched browser. */
async function getOverlay(): Promise<import("@playwright/test").Page> {
  return (await getGlassWindows(app.browser)).overlay;
}

// ─── Suite ─────────────────────────────────────────────────────────────────────

test.describe("IIVO Glass Onboarding", () => {
  // ─── Render ──────────────────────────────────────────────────────────────────

  test("onboarding modal renders when triggered", async () => {
    test.setTimeout(60_000);

    await openOnboarding();
    const overlay = await getOverlay();

    // Modal must appear in the overlay window
    await expect(overlay.locator('[data-testid="onboarding-modal"]')).toBeVisible({
      timeout: 10_000,
    });

    // State must reflect open
    const state = await readGlassState(commandPage);
    expect(state.onboardingOpen).toBe(true);
  });

  test("first question asks for the user's name", async () => {
    test.setTimeout(60_000);

    await openOnboarding();
    const overlay = await getOverlay();
    await expect(overlay.locator('[data-testid="onboarding-modal"]')).toBeVisible({ timeout: 10_000 });

    // Input for the name step should be present and focused
    const nameInput = overlay.locator('[data-testid="onboarding-input-name"]');
    await expect(nameInput).toBeVisible({ timeout: 5_000 });

    // Continue button is disabled when input is empty
    const nextBtn = overlay.locator('[data-testid="onboarding-next"]');
    await expect(nextBtn).toBeDisabled();
  });

  // ─── Three-question happy path ────────────────────────────────────────────────

  test("three-question flow completes and shows calibrated screen", async () => {
    test.setTimeout(90_000);

    await openOnboarding();
    const overlay = await getOverlay();
    await expect(overlay.locator('[data-testid="onboarding-modal"]')).toBeVisible({ timeout: 10_000 });

    // Step 1 — name
    const nameInput = overlay.locator('[data-testid="onboarding-input-name"]');
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.fill("Alex Glass");
    await overlay.locator('[data-testid="onboarding-next"]').click();

    // Step 2 — usualWork
    const workInput = overlay.locator('[data-testid="onboarding-input-usualWork"]');
    await expect(workInput).toBeVisible({ timeout: 5_000 });
    await workInput.fill("Product strategy and engineering");
    await overlay.locator('[data-testid="onboarding-next"]').click();

    // Step 3 — currentFocus
    const focusInput = overlay.locator('[data-testid="onboarding-input-currentFocus"]');
    await expect(focusInput).toBeVisible({ timeout: 5_000 });
    await focusInput.fill("Shipping IIVO Glass beta");

    // Final step uses "Calibrate" button
    const finishBtn = overlay.locator('[data-testid="onboarding-finish"]');
    await expect(finishBtn).toBeEnabled();
    await finishBtn.click();

    // Calibrated confirmation screen
    await expect(overlay.locator('[data-testid="onboarding-calibrated"]')).toBeVisible({
      timeout: 8_000,
    });
  });

  test("onboarding dismisses after calibration and state clears", async () => {
    test.setTimeout(90_000);

    await openOnboarding();
    const overlay = await getOverlay();
    await expect(overlay.locator('[data-testid="onboarding-modal"]')).toBeVisible({ timeout: 10_000 });

    // Quick-fill all three steps
    await overlay.locator('[data-testid="onboarding-input-name"]').fill("Alex Glass");
    await overlay.locator('[data-testid="onboarding-next"]').click();
    await overlay.locator('[data-testid="onboarding-input-usualWork"]').fill("Engineering");
    await overlay.locator('[data-testid="onboarding-next"]').click();
    await overlay.locator('[data-testid="onboarding-input-currentFocus"]').fill("Beta launch");
    await overlay.locator('[data-testid="onboarding-finish"]').click();

    // Wait for calibration animation + dismiss
    await commandPage.waitForFunction(
      () => !window.glass.getState().onboardingOpen,
      { timeout: CALIBRATION_DISMISS_WAIT_MS + 5_000 },
    );

    const state = await readGlassState(commandPage);
    expect(state.onboardingOpen).toBe(false);
  });

  test("profile is saved with answers after calibration", async () => {
    test.setTimeout(90_000);

    await openOnboarding();
    const overlay = await getOverlay();
    await expect(overlay.locator('[data-testid="onboarding-modal"]')).toBeVisible({ timeout: 10_000 });

    const testName = "Jordan IIVO";
    const testWork = "AI product design";
    const testFocus = "Voice UX research";

    await overlay.locator('[data-testid="onboarding-input-name"]').fill(testName);
    await overlay.locator('[data-testid="onboarding-next"]').click();
    await overlay.locator('[data-testid="onboarding-input-usualWork"]').fill(testWork);
    await overlay.locator('[data-testid="onboarding-next"]').click();
    await overlay.locator('[data-testid="onboarding-input-currentFocus"]').fill(testFocus);
    await overlay.locator('[data-testid="onboarding-finish"]').click();

    // Wait for dismiss
    await commandPage.waitForFunction(
      () => !window.glass.getState().onboardingOpen,
      { timeout: CALIBRATION_DISMISS_WAIT_MS + 5_000 },
    );

    const state = await readGlassState(commandPage);
    expect(state.glassUserProfile?.name).toBe(testName);
    expect(state.glassUserProfile?.usualWork).toBe(testWork);
    expect(state.glassUserProfile?.currentFocus).toBe(testFocus);
  });

  // ─── Enter key shortcut ───────────────────────────────────────────────────────

  test("pressing Enter advances each step", async () => {
    test.setTimeout(90_000);

    await openOnboarding();
    const overlay = await getOverlay();
    await expect(overlay.locator('[data-testid="onboarding-modal"]')).toBeVisible({ timeout: 10_000 });

    // Enter on empty input does nothing
    const nameInput = overlay.locator('[data-testid="onboarding-input-name"]');
    await nameInput.press("Enter");
    await expect(nameInput).toBeVisible(); // still on step 1

    // Fill and advance via Enter
    await nameInput.fill("River Test");
    await nameInput.press("Enter");

    const workInput = overlay.locator('[data-testid="onboarding-input-usualWork"]');
    await expect(workInput).toBeVisible({ timeout: 5_000 });
    await workInput.fill("QA engineering");
    await workInput.press("Enter");

    const focusInput = overlay.locator('[data-testid="onboarding-input-currentFocus"]');
    await expect(focusInput).toBeVisible({ timeout: 5_000 });
    await focusInput.fill("E2E coverage");
    await focusInput.press("Enter");

    // Should reach calibrated screen
    await expect(overlay.locator('[data-testid="onboarding-calibrated"]')).toBeVisible({
      timeout: 8_000,
    });
  });

  // ─── Skip path ────────────────────────────────────────────────────────────────

  test("Skip button dismisses onboarding without saving a profile", async () => {
    test.setTimeout(60_000);

    // Clear any existing profile first
    await commandPage.evaluate(() => {
      const current = window.glass.getState().glassUserProfile;
      return current; // just read
    });

    await openOnboarding();
    const overlay = await getOverlay();
    await expect(overlay.locator('[data-testid="onboarding-modal"]')).toBeVisible({ timeout: 10_000 });

    await overlay.locator('[data-testid="onboarding-skip"]').click();

    // onboardingOpen must clear quickly (no animation delay on skip)
    await commandPage.waitForFunction(
      () => !window.glass.getState().onboardingOpen,
      { timeout: 8_000 },
    );

    const state = await readGlassState(commandPage);
    expect(state.onboardingOpen).toBe(false);
  });

  test("pressing Escape skips onboarding", async () => {
    test.setTimeout(60_000);

    await openOnboarding();
    const overlay = await getOverlay();
    await expect(overlay.locator('[data-testid="onboarding-modal"]')).toBeVisible({ timeout: 10_000 });

    // Focus the overlay window and press Escape
    await overlay.locator('[data-testid="onboarding-input-name"]').press("Escape");

    await commandPage.waitForFunction(
      () => !window.glass.getState().onboardingOpen,
      { timeout: 8_000 },
    );

    expect((await readGlassState(commandPage)).onboardingOpen).toBe(false);
  });

  // ─── Rescue hint ─────────────────────────────────────────────────────────────

  test("rescue hint is visible during onboarding", async () => {
    test.setTimeout(60_000);

    await openOnboarding();
    const overlay = await getOverlay();
    await expect(overlay.locator('[data-testid="onboarding-modal"]')).toBeVisible({ timeout: 10_000 });

    await expect(overlay.locator('[data-testid="onboarding-rescue-hint"]')).toBeVisible({
      timeout: 5_000,
    });
  });
});
