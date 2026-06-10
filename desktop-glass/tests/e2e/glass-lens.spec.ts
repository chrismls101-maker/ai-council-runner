import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import {
  closeGlassApp,
  connectIivoGlassForE2e,
  getGlassWindows,
  getElectronE2eSkipReason,
  GLASS_ELECTRON_BIN,
  GLASS_MAIN,
  launchGlassApp,
  openPanelTab,
  readGlassState,
  resetE2eExternalUrls,
  type LaunchedGlass,
} from "./helpers/electronApp.ts";
import { logE2eFailureDiagnostics } from "./helpers/e2eFailureDiagnostics.ts";

let app: LaunchedGlass;
let commandPage: Page;

async function resetLensUi(command: Page): Promise<void> {
  const attachedDismiss = command.locator('[data-testid="glass-command-lens-attached-dismiss"]');
  if (await attachedDismiss.isVisible().catch(() => false)) {
    await attachedDismiss.click();
  }
  const panelClose = command.locator('[data-testid="glass-lens-panel-close"]');
  if (await panelClose.isVisible().catch(() => false)) {
    await panelClose.click();
  }
  await expect(command.locator('[data-testid="glass-lens-panel"]')).toHaveCount(0);
  await expect(command.locator('[data-testid="glass-command-lens-attached"]')).toHaveCount(0);
}

async function openLensPanel(command: Page): Promise<void> {
  await command.locator('[data-testid="glass-command-lens"]').click();
  await expect(command.locator('[data-testid="glass-lens-panel"]')).toBeVisible({ timeout: 15_000 });
}

/** Lens-only reset — keeps Setup "connected" state (no e2e-reset-setup-state). */
async function resetLensE2eState(command: Page): Promise<void> {
  await command.evaluate(() => {
    window.glass.send({ type: "cancel-glass-ask" });
    window.glass.send({ type: "clear-command-feed" });
  });
  await resetE2eExternalUrls(command);
  await resetLensUi(command);
}

test.beforeAll(async () => {
  const skipReason = getElectronE2eSkipReason();
  test.skip(!!skipReason, skipReason ?? undefined);

  if (!fs.existsSync(GLASS_MAIN)) {
    throw new Error(
      "Glass main bundle missing. Run `npm run build --prefix desktop-glass` before `npm run e2e`.",
    );
  }
  if (!fs.existsSync(GLASS_ELECTRON_BIN)) {
    throw new Error(
      "Electron binary missing. Run `npm install --prefix desktop-glass` before `npm run e2e`.",
    );
  }

  app = await launchGlassApp();
  const windows = await getGlassWindows(app.browser);
  commandPage = windows.command;

  await expect(commandPage.locator('[data-testid="glass-command-bar"]')).toBeVisible();
  expect(app.electronProcess.exitCode).toBeNull();

  await connectIivoGlassForE2e(app.browser);
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
  const { command } = await getGlassWindows(app.browser);
  await resetLensE2eState(command);
  app.stub.resetHandoffState();
});

test.describe("IIVO Glass Lens E2E", () => {
  test("glass-lens-health-connected", async () => {
    const { command, dock, panel } = await getGlassWindows(app.browser);

    await dock.locator('[data-testid="glass-dock-open-panel"]').click();
    await openPanelTab(panel, "setup");
    await expect(panel.locator('[data-testid="glass-panel-setup"]')).toBeVisible();

    const connectBtn = panel.locator('[data-testid="glass-run-setup-check"]');
    await expect(connectBtn).toHaveAttribute("data-connected", "true");
    await expect(connectBtn).toContainText("IIVO GLASS CONNECTED");
    await expect(connectBtn.locator(".connect-glass__dot--on")).toBeVisible();

    await expect(panel.locator('[data-testid="glass-setup-row-server"]')).toContainText("Online");
    await expect(
      panel.locator('[data-testid="glass-setup-row-server"] .status-dot--ok'),
    ).toBeVisible();
    await expect(panel.locator('[data-testid="glass-setup-row-vision"]')).toContainText(
      /enabled|ready|online/i,
    );
    await expect(
      panel.locator('[data-testid="glass-setup-row-vision"] .status-dot--ok'),
    ).toBeVisible();

    const state = await readGlassState(command);
    expect(state.setupCapabilities?.find((r) => r.id === "server")?.label).toBe("Online");
    expect(state.systemAudioStatus).toBe("available");
    expect(app.electronProcess.exitCode).toBeNull();
  });

  test("glass-lens-button-visible", async () => {
    const { command } = await getGlassWindows(app.browser);
    await expect(command.locator('[data-testid="glass-command-lens"]')).toBeVisible();
  });

  test("glass-lens-panel-opens", async () => {
    const { command } = await getGlassWindows(app.browser);
    await openLensPanel(command);

    await expect(command.locator('[data-testid="glass-lens-panel-title"]')).toContainText(
      "Test Page Title",
    );
    await expect(command.locator('[data-testid="glass-lens-panel-domain"]')).toContainText(
      "example.com",
    );
    await expect(command.locator('[data-testid="glass-lens-panel-close"]')).toBeVisible();
  });

  test("glass-lens-panel-close", async () => {
    const { command } = await getGlassWindows(app.browser);
    await openLensPanel(command);
    await command.locator('[data-testid="glass-lens-panel-close"]').click();

    await expect(command.locator('[data-testid="glass-lens-panel"]')).toHaveCount(0);
    await expect(command.locator('[data-testid="glass-command-lens-attached"]')).toHaveCount(0);
  });

  test("glass-lens-take-screenshot", async () => {
    const { command } = await getGlassWindows(app.browser);
    await openLensPanel(command);

    await expect(command.locator('[data-testid="glass-lens-panel-preview-empty"]')).toBeVisible();
    await command.locator('[data-testid="glass-lens-panel-take-screenshot"]').click();
    await expect(command.locator('[data-testid="glass-lens-panel-screenshot"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(command.locator('[data-testid="glass-lens-panel-preview-empty"]')).toHaveCount(0);
  });

  test("glass-lens-lightbox", async () => {
    const { command } = await getGlassWindows(app.browser);
    await openLensPanel(command);
    await command.locator('[data-testid="glass-lens-panel-take-screenshot"]').click();
    await expect(command.locator('[data-testid="glass-lens-panel-screenshot"]')).toBeVisible({
      timeout: 10_000,
    });

    await command.locator('[data-testid="glass-lens-panel-screenshot"]').click();
    await expect(command.locator('[data-testid="glass-lens-panel-lightbox"]')).toBeVisible();
    await command.locator('[data-testid="glass-lens-panel-lightbox-close"]').click();
    await expect(command.locator('[data-testid="glass-lens-panel-lightbox"]')).toHaveCount(0);
  });

  test("glass-lens-ask-about-page", async () => {
    const { command } = await getGlassWindows(app.browser);
    await openLensPanel(command);
    await command.locator('[data-testid="glass-lens-panel-ask-page-no-screenshot"]').click();

    await expect(command.locator('[data-testid="glass-lens-panel"]')).toHaveCount(0);
    await expect(command.locator('[data-testid="glass-command-lens-attached"]')).toBeVisible();
    await expect(command.locator('[data-testid="glass-command-lens-attached-label"]')).toContainText(
      "example.com",
    );
    await expect(command.locator('[data-testid="glass-command-input"]')).toHaveAttribute(
      "placeholder",
      /Ask about this page/i,
    );
  });

  test("glass-lens-ask-about-screenshot", async () => {
    const { command } = await getGlassWindows(app.browser);
    await openLensPanel(command);
    await command.locator('[data-testid="glass-lens-panel-take-screenshot"]').click();
    await expect(command.locator('[data-testid="glass-lens-panel-screenshot"]')).toBeVisible({
      timeout: 10_000,
    });
    await command.locator('[data-testid="glass-lens-panel-ask-screenshot"]').click();

    await expect(command.locator('[data-testid="glass-lens-panel"]')).toHaveCount(0);
    await expect(command.locator('[data-testid="glass-command-lens-attached"]')).toBeVisible();
    await expect(command.locator('[data-testid="glass-command-input"]')).toHaveAttribute(
      "placeholder",
      /Ask about this screenshot/i,
    );
  });

  test("glass-lens-back-from-chip", async () => {
    const { command } = await getGlassWindows(app.browser);
    await openLensPanel(command);
    await command.locator('[data-testid="glass-lens-panel-ask-page-no-screenshot"]').click();

    await expect(command.locator('[data-testid="glass-lens-panel"]')).toHaveCount(0);
    await command.locator('[data-testid="glass-command-lens-attached-back"]').click();

    await expect(command.locator('[data-testid="glass-lens-panel"]')).toBeVisible();
    await expect(command.locator('[data-testid="glass-lens-panel-title"]')).toContainText(
      "Test Page Title",
    );
  });

  test("glass-lens-chip-reopen", async () => {
    const { command } = await getGlassWindows(app.browser);
    await openLensPanel(command);
    await command.locator('[data-testid="glass-lens-panel-ask-page-no-screenshot"]').click();

    await expect(command.locator('[data-testid="glass-lens-panel"]')).toHaveCount(0);
    await command.locator('[data-testid="glass-command-lens-attached-reopen"]').click();

    await expect(command.locator('[data-testid="glass-lens-panel"]')).toBeVisible();
  });

  test("glass-lens-submit-clears-context", async () => {
    const { command, overlay } = await getGlassWindows(app.browser);
    await openLensPanel(command);
    await command.locator('[data-testid="glass-lens-panel-ask-page-no-screenshot"]').click();

    const input = command.locator('[data-testid="glass-command-input"]');
    await input.click();
    await input.fill("what is this page about");
    await command.locator('[data-testid="glass-command-submit"]').click();

    await expect(
      overlay
        .locator('[data-testid="glass-overlay-thinking-card"]')
        .or(overlay.locator('[data-testid="glass-overlay-response-card"]')),
    ).toBeVisible({ timeout: 15_000 });

    await expect(command.locator('[data-testid="glass-command-lens-attached"]')).toHaveCount(0);
  });
});
