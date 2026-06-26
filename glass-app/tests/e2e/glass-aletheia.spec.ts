/**
 * IIVO Glass — Aletheia strip menu + dashboard (public architecture sprint)
 *
 * Run: npm run e2e:aletheia
 *
 * Watch-friendly: set IIVO_E2E_DWELL_MS=1500 to pause after each dashboard open.
 * One Electron instance for the whole file — serial tests, light reset (no stop-everything).
 */

import { test, expect, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import {
  closeGlassApp,
  getElectronE2eSkipReason,
  getGlassWindows,
  GLASS_ELECTRON_BIN,
  GLASS_MAIN,
  launchGlassApp,
  readGlassState,
  type LaunchedGlass,
} from "./helpers/electronApp.ts";
import { logE2eFailureDiagnostics } from "./helpers/e2eFailureDiagnostics.ts";
import { resetAletheiaE2eState } from "./helpers/e2eSetupReset.ts";

/** Pause after UI opens so dashboards/strip are visible when watching tests (override with 0 in CI). */
const E2E_DWELL_MS = Number(process.env.IIVO_E2E_DWELL_MS ?? 800);

let app: LaunchedGlass;
let commandPage: import("@playwright/test").Page;

async function dwell(): Promise<void> {
  if (E2E_DWELL_MS > 0) {
    await new Promise((resolve) => setTimeout(resolve, E2E_DWELL_MS));
  }
}

async function ensureAletheiaE2eReady(browser: Browser): Promise<void> {
  const { overlay } = await getGlassWindows(browser);
  await expect(overlay.locator('[data-testid="glass-builder-strip"]')).toBeVisible({
    timeout: 10_000,
  });
  await overlay.evaluate(() => {
    window.glass?.setOverlayPointerOverBuilderStrip?.(true);
  });
}

/** OS click-through overlay — dispatch clicks inside the renderer instead of Playwright mouse. */
async function clickOverlayTestId(page: Page, testId: string): Promise<void> {
  await page.evaluate((id) => {
    window.glass?.setOverlayPointerOverBuilderStrip?.(true);
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!(el instanceof HTMLElement)) {
      throw new Error(`overlay test id not found: ${id}`);
    }
    el.click();
  }, testId);
}

async function waitForAletheiaDashboard(overlay: Page): Promise<void> {
  await expect(overlay.locator('[data-testid="aletheia-dashboard-shell"]')).toBeVisible({
    timeout: 15_000,
  });
  await expect(overlay.locator('[data-testid="aletheia-dashboard-presence"]')).toBeVisible();
  await dwell();
}

async function openAletheiaDashboardViaMenu(overlay: Page): Promise<void> {
  await clickOverlayTestId(overlay, "glass-companion-toggle");
  await expect(overlay.locator('[data-testid="aletheia-strip-menu"]')).toBeVisible();
  await clickOverlayTestId(overlay, "aletheia-strip-menu-dashboard");
  await waitForAletheiaDashboard(overlay);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const skipReason = getElectronE2eSkipReason();
  test.skip(!!skipReason, skipReason ?? undefined);

  if (!fs.existsSync(GLASS_MAIN)) {
    throw new Error("Glass main bundle missing. Run `npm run build --prefix glass-app`.");
  }
  if (!fs.existsSync(GLASS_ELECTRON_BIN)) {
    throw new Error("Electron binary missing. Run `npm install --prefix glass-app`.");
  }

  app = await launchGlassApp();
  const { command, overlay } = await getGlassWindows(app.browser);
  commandPage = command;
  await resetAletheiaE2eState(overlay);
  await resetAletheiaE2eState(command);
  await ensureAletheiaE2eReady(app.browser);
});

test.afterAll(async () => {
  if (app) await closeGlassApp(app);
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await logE2eFailureDiagnostics(app, commandPage, testInfo.title);
  }
});

test.beforeEach(async () => {
  const { command, overlay } = await getGlassWindows(app.browser);
  await resetAletheiaE2eState(overlay);
  await resetAletheiaE2eState(command);
  await expect
    .poll(async () => {
      const s = await readGlassState(command);
      return s.glassDashboardActive !== true && s.aletheiaDashboardActive !== true;
    })
    .toBe(true);
  await ensureAletheiaE2eReady(app.browser);
});

test.describe("IIVO Glass Aletheia", () => {
  test("builder strip shows System tab and Aletheia menu", async () => {
    const { overlay } = await getGlassWindows(app.browser);

    await expect(overlay.locator('[data-testid="glass-builder-strip"]')).toBeVisible();
    await expect(overlay.locator('[data-testid="glass-builder-strip-dashboard"]')).toContainText("System");
    await expect(overlay.locator('[data-testid="glass-companion-toggle"]')).toBeVisible();
    await dwell();
  });

  test("Aletheia menu activates and deactivates companion mode", async () => {
    const { overlay, command } = await getGlassWindows(app.browser);

    await clickOverlayTestId(overlay, "glass-companion-toggle");
    await expect(overlay.locator('[data-testid="aletheia-strip-menu"]')).toBeVisible();
    await dwell();

    await clickOverlayTestId(overlay, "aletheia-strip-menu-activate");

    await expect
      .poll(async () => (await readGlassState(command)).companionModeActive === true)
      .toBe(true);
    await dwell();

    await clickOverlayTestId(overlay, "glass-companion-toggle");
    await clickOverlayTestId(overlay, "aletheia-strip-menu-deactivate");

    await expect
      .poll(async () => (await readGlassState(command)).companionModeActive !== true)
      .toBe(true);
    await dwell();
  });

  test("Aletheia dashboard opens with trust panels", async () => {
    const { overlay } = await getGlassWindows(app.browser);

    await openAletheiaDashboardViaMenu(overlay);

    await expect(overlay.locator('[data-testid="aletheia-dashboard-permissions"]')).toBeVisible();
    await expect(overlay.locator('[data-testid="aletheia-dashboard-privacy"]')).toBeVisible();
    await expect(overlay.locator('[data-testid="aletheia-dashboard-sessions"]')).toBeVisible();
    await expect(overlay.locator('[data-testid="aletheia-dashboard-memory"]')).toBeVisible();
    await dwell();
  });

  test("dashboard mutual exclusion closes Aletheia when opening Glass System", async () => {
    const { overlay, command } = await getGlassWindows(app.browser);

    await overlay.evaluate(() => window.glass.openAletheiaDashboard());
    await waitForAletheiaDashboard(overlay);

    await overlay.evaluate(() => window.glass.openDashboard());

    await expect
      .poll(async () => {
        const s = await readGlassState(command);
        return s.glassDashboardActive === true && s.aletheiaDashboardActive !== true;
      })
      .toBe(true);

    await expect(overlay.locator('[data-testid="glass-dashboard-shell"]')).toBeVisible();
    await expect(overlay.locator('[data-testid="aletheia-dashboard-shell"]')).toHaveClass(/hidden/);

    const state = await readGlassState(command);
    expect(state.aletheiaDashboardActive).not.toBe(true);
    expect(state.glassDashboardActive).toBe(true);

    await overlay.evaluate(() => window.glass.closeDashboard());
    await expect(overlay.locator('[data-testid="glass-builder-strip"]')).toBeVisible();
    await dwell();
  });

  test("Aletheia dashboard privacy controls send IPC", async () => {
    const { overlay, command } = await getGlassWindows(app.browser);

    await overlay.evaluate(() => {
      window.glass.send({ type: "toggle-companion-mode" });
      window.glass.openAletheiaDashboard();
    });
    await waitForAletheiaDashboard(overlay);

    await clickOverlayTestId(overlay, "aletheia-dashboard-privacy-start");

    await expect
      .poll(async () => (await readGlassState(command)).companionPrivacy?.active === true)
      .toBe(true);
    await dwell();

    await clickOverlayTestId(overlay, "aletheia-dashboard-privacy-end");

    await expect
      .poll(async () => !(await readGlassState(command)).companionPrivacy?.active)
      .toBe(true);
    await dwell();
  });
});
