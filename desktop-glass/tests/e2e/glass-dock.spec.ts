import { test, expect, type Browser } from "@playwright/test";
import fs from "node:fs";
import {
  closeGlassApp,
  getGlassWindows,
  getElectronE2eSkipReason,
  GLASS_ELECTRON_BIN,
  GLASS_MAIN,
  launchGlassApp,
  readGlassState,
  connectIivoGlassForE2e,
  openPanelTab,
  type LaunchedGlass,
} from "./helpers/electronApp.ts";
import { logE2eFailureDiagnostics } from "./helpers/e2eFailureDiagnostics.ts";
import { resetE2eSetupState } from "./helpers/e2eSetupReset.ts";

let app: LaunchedGlass;
let commandPage: import("@playwright/test").Page;

async function ensureGlassSetupGreen(browser: Browser): Promise<void> {
  await connectIivoGlassForE2e(browser);

  const { command, dock, panel } = await getGlassWindows(browser);
  await command.evaluate(() => {
    window.glass.send({
      type: "e2e-set-capture-probes",
      screenCaptureProbe: "ready",
      windowCaptureProbe: "ready",
    });
  });

  await dock.locator('[data-testid="glass-dock-open-panel"]').click();
  await openPanelTab(panel, "setup");
  await expect(panel.locator('[data-testid="glass-panel-setup"]')).toBeVisible();

  const connectBtn = panel.locator('[data-testid="glass-run-setup-check"]');
  await expect(connectBtn).toHaveAttribute("data-connected", "true");
  await expect(connectBtn).toContainText("IIVO GLASS CONNECTED");
  await expect(connectBtn.locator(".connect-glass__dot--on")).toBeVisible();

  await expect(panel.locator('[data-testid="glass-setup-row-server"] .status-dot--ok')).toBeVisible();
  await expect(panel.locator('[data-testid="glass-setup-row-vision"] .status-dot--ok')).toBeVisible();
  await expect(
    panel.locator('[data-testid="glass-setup-row-screenRecording"] .status-dot--ok'),
  ).toBeVisible();

  const state = await readGlassState(command);
  expect(state.setupCapabilities?.find((r) => r.id === "server")?.label).toBe("Online");
  expect(state.systemAudioStatus).toBe("available");

  if (state.panelVisible) {
    await dock.locator('[data-testid="glass-dock-open-panel"]').click();
    await expect
      .poll(async () => (await readGlassState(command)).panelVisible)
      .toBe(false);
  }
}

test.beforeAll(async () => {
  const skipReason = getElectronE2eSkipReason();
  test.skip(!!skipReason, skipReason ?? undefined);

  if (!fs.existsSync(GLASS_MAIN)) {
    throw new Error(
      "Glass main bundle missing. Run `npm run build --prefix desktop-glass` before `npm run glass:e2e`.",
    );
  }
  if (!fs.existsSync(GLASS_ELECTRON_BIN)) {
    throw new Error(
      "Electron binary missing. Run `npm install --prefix desktop-glass` before `npm run glass:e2e`.",
    );
  }

  app = await launchGlassApp();
  const windows = await getGlassWindows(app.browser);
  commandPage = windows.command;
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
  await resetE2eSetupState(command);
  await command.evaluate(() => {
    window.glass.send({ type: "stop-everything" });
    window.glass.send({ type: "session-end" });
    window.glass.send({ type: "set-dock-orientation", orientation: "horizontal" });
  });
  await ensureGlassSetupGreen(app.browser);
});

test.describe("IIVO Glass dock E2E", () => {
  test("glass-dock-visible", async () => {
    const { dock } = await getGlassWindows(app.browser);
    await expect(dock.locator('[data-testid="glass-dock"]')).toBeVisible();
  });

  test("glass-dock-start-session", async () => {
    const { command, dock } = await getGlassWindows(app.browser);

    await dock.locator('[data-testid="glass-dock-start-session"]').click();

    await expect
      .poll(async () => (await readGlassState(command)).session?.status ?? null)
      .toBe("active");

    const state = await readGlassState(command);
    expect(state.session).not.toBeNull();
    expect(state.session?.status).toBe("active");
    await expect(command.locator('[data-testid="glass-command-session-status"]')).toBeVisible();
    await expect(command.locator('[data-testid="glass-overlay-session-status"]')).toHaveCount(0);
  });

  test("glass-dock-pause-resume", async () => {
    const { dock } = await getGlassWindows(app.browser);

    await dock.locator('[data-testid="glass-dock-start-session"]').click();
    await expect(dock.locator('[data-testid="glass-dock-pause"]')).toBeVisible();

    await dock.locator('[data-testid="glass-dock-pause"]').click();
    await expect(dock.locator('[data-testid="glass-dock-resume"]')).toBeVisible();
    await expect(dock.locator('[data-testid="glass-dock-pause"]')).toHaveCount(0);

    await dock.locator('[data-testid="glass-dock-resume"]').click();
    await expect(dock.locator('[data-testid="glass-dock-pause"]')).toBeVisible();
    await expect(dock.locator('[data-testid="glass-dock-resume"]')).toHaveCount(0);
  });

  test("glass-dock-end-session", async () => {
    const { command, dock } = await getGlassWindows(app.browser);

    await dock.locator('[data-testid="glass-dock-start-session"]').click();
    await expect(dock.locator('[data-testid="glass-dock-pause"]')).toBeVisible();

    await dock.locator('[data-testid="glass-dock-end-session"]').click();

    await expect
      .poll(async () => (await readGlassState(command)).session?.status ?? "idle")
      .toBe("ended");
    await expect(dock.locator('[data-testid="glass-dock-start-session"]')).toBeVisible();
  });

  test("glass-dock-panel-toggle", async () => {
    const { command, dock, panel } = await getGlassWindows(app.browser);

    expect((await readGlassState(command)).panelVisible).toBe(false);

    await dock.locator('[data-testid="glass-dock-open-panel"]').click();
    await expect(panel.locator('[data-testid="glass-panel"]')).toBeVisible();
    await expect
      .poll(async () => (await readGlassState(command)).panelVisible)
      .toBe(true);

    await dock.locator('[data-testid="glass-dock-open-panel"]').click();
    await expect
      .poll(async () => (await readGlassState(command)).panelVisible)
      .toBe(false);
  });

  test("glass-dock-capture", async () => {
    const { command, dock } = await getGlassWindows(app.browser);

    await dock.locator('[data-testid="glass-dock-capture"]').click();

    await expect
      .poll(async () => (await readGlassState(command)).operationDiagnostics.captureStatus ?? "")
      .toMatch(/Captur|Captured/i);
  });

  test("glass-dock-hide-show-overlay", async () => {
    const { command, dock } = await getGlassWindows(app.browser);

    const initial = await readGlassState(command);
    if (!initial.windows?.overlayVisible) {
      await dock.locator('[data-testid="glass-dock-show-overlay"]').click();
    }

    await dock.locator('[data-testid="glass-dock-hide-overlay"]').click();
    await expect
      .poll(async () => (await readGlassState(command)).windows?.overlayVisible)
      .toBe(false);
    await expect(dock.locator('[data-testid="glass-dock-show-overlay"]')).toBeVisible();

    await dock.locator('[data-testid="glass-dock-show-overlay"]').click();
    await expect
      .poll(async () => (await readGlassState(command)).windows?.overlayVisible)
      .toBe(true);
    await expect(dock.locator('[data-testid="glass-dock-hide-overlay"]')).toBeVisible();
  });

  test("glass-dock-orientation", async () => {
    const { command, dock } = await getGlassWindows(app.browser);
    const dockRoot = dock.locator('[data-testid="glass-dock"]');

    await expect(dockRoot).not.toHaveClass(/dock--vertical/);

    await dock.locator('[data-testid="glass-dock-orientation"]').click();
    await expect
      .poll(async () => (await readGlassState(command)).glassSettings.dockOrientation)
      .toBe("vertical");
    await expect(dockRoot).toHaveClass(/dock--vertical/);

    await dock.locator('[data-testid="glass-dock-orientation"]').click();
    await expect
      .poll(async () => (await readGlassState(command)).glassSettings.dockOrientation)
      .toBe("horizontal");
    await expect(dockRoot).not.toHaveClass(/dock--vertical/);
  });

  test("glass-dock-stop-everything", async () => {
    const { command, dock } = await getGlassWindows(app.browser);

    await command.evaluate(() => window.glass.send({ type: "start-listening" }));

    await expect
      .poll(async () => (await readGlassState(command)).privacy.listening)
      .toBe(true);

    await dock.locator('[data-testid="glass-dock-stop-everything"]').click();

    await expect
      .poll(async () => (await readGlassState(command)).privacy.listening)
      .toBe(false);
  });
});
