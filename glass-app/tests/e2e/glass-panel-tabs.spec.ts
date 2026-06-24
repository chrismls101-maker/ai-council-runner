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

async function openPanel(browser: Browser) {
  const { dock, panel } = await getGlassWindows(browser);
  await dock.locator('[data-testid="glass-dock-open-panel"]').click();
  await expect(panel.locator('[data-testid="glass-panel"]')).toBeVisible();
  return { dock, panel };
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
    window.glass.send({ type: "session-clear" });
    window.glass.send({ type: "clear-moments" });
  });
  await ensureGlassSetupGreen(app.browser);
});

test.describe("IIVO Glass panel tabs E2E", () => {
  test("glass-panel-tab-summary", async () => {
    const { panel } = await openPanel(app.browser);
    await openPanelTab(panel, "summary");
    await expect(panel.getByText("No summary yet")).toBeVisible();
  });

  test("glass-panel-tab-session-empty", async () => {
    const { panel } = await openPanel(app.browser);
    await openPanelTab(panel, "session");
    await expect(panel.getByText("No session yet")).toBeVisible();
  });

  test("glass-panel-tab-insights", async () => {
    const { panel } = await openPanel(app.browser);
    await openPanelTab(panel, "insights");
    await expect(panel.getByText("Start a session to extract live insights")).toBeVisible();
  });

  test("glass-panel-tab-context", async () => {
    const { panel } = await openPanel(app.browser);
    await openPanelTab(panel, "context");
    await expect(panel.getByText("No questions detected yet.")).toBeVisible();
    await expect(panel.getByText("No saved moments yet.")).toBeVisible();
  });

  test("glass-panel-tab-hypotheses", async () => {
    const { panel } = await openPanel(app.browser);
    await openPanelTab(panel, "hypotheses");
    await expect(panel.getByText(/No hypotheses detected/)).toBeVisible();
  });

  test("glass-panel-tab-actions", async () => {
    const { panel } = await openPanel(app.browser);
    await openPanelTab(panel, "actions");
    await expect(panel.getByText(/No action items detected/)).toBeVisible();
  });

  test("glass-panel-tab-diagnostics", async () => {
    const { panel } = await openPanel(app.browser);
    await openPanelTab(panel, "diagnostics");
    await expect(panel.getByText("Operation diagnostics")).toBeVisible();

    const state = await readGlassState(commandPage);
    expect(state.operationDiagnostics).not.toBeNull();
  });

  // Last: starting a session leaves an ended-session object in store (Insights empty copy needs null session).
  test("glass-panel-tab-session-active", async () => {
    const { dock, panel } = await openPanel(app.browser);
    await openPanelTab(panel, "session");
    await expect(panel.getByText("No session yet")).toBeVisible();

    await dock.locator('[data-testid="glass-dock-start-session"]').click();
    await expect(panel.getByText("No session yet")).toHaveCount(0);
  });
});
