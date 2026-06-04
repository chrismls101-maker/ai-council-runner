import { test, expect } from "@playwright/test";
import fs from "node:fs";
import {
  closeGlassApp,
  getE2eExternalUrls,
  getGlassWindows,
  GLASS_ELECTRON_BIN,
  GLASS_MAIN,
  launchGlassApp,
  readGlassState,
  resetE2eExternalUrls,
  shouldSkipElectronE2e,
  type LaunchedGlass,
} from "./helpers/electronApp.ts";

const COUNCIL_MARKERS = [
  "Final Action Plan",
  "Decision Quality",
  "Sales Attack",
  "Product Decision",
  "Final Judge",
];

let app: LaunchedGlass;
let commandPage: import("@playwright/test").Page;

test.beforeAll(async () => {
  const skipReason = shouldSkipElectronE2e();
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

test.beforeEach(async () => {
  const { command } = await getGlassWindows(app.browser);
  await command.evaluate(() => window.glass.send({ type: "clear-command-feed" }));
  await resetE2eExternalUrls(command);
});

test.describe("IIVO Glass Electron E2E", () => {
  test("1 — app launches and core windows exist", async () => {
    const { command, overlay, dock } = await getGlassWindows(app.browser);

    await expect(command.locator('[data-testid="glass-command-bar"]')).toBeVisible();
    await expect(overlay.locator('[data-testid="glass-overlay-root"]')).toBeVisible();
    await expect(dock.locator('[data-testid="glass-dock"]')).toBeVisible();
    expect(app.electronProcess.exitCode).toBeNull();
  });

  test("2 — command bar direct answer renders inline", async () => {
    const { command, overlay } = await getGlassWindows(app.browser);

    const input = command.locator('[data-testid="glass-command-input"]');
    await input.click();
    await input.fill("What am I working on?");
    await input.press("Enter");

    await expect(overlay.locator('[data-testid="glass-overlay-thinking-card"]')).toBeVisible();
    await expect(overlay.locator('[data-testid="glass-overlay-response-card"]')).toBeVisible({
      timeout: 15_000,
    });

    const responseText = await overlay
      .locator('[data-testid="glass-overlay-response-card"]')
      .innerText();
    expect(responseText).toContain("IIVO Glass is working");

    for (const marker of COUNCIL_MARKERS) {
      expect(responseText).not.toContain(marker);
    }

    expect(await getE2eExternalUrls(command)).toHaveLength(0);
  });

  test("3 — cancel pending ask", async () => {
    const { command, overlay } = await getGlassWindows(app.browser);

    const input = command.locator('[data-testid="glass-command-input"]');
    await input.click();
    await input.fill("E2E_DELAY_ASK cancel test");
    await input.press("Enter");

    await expect(command.locator('[data-testid="glass-command-cancel"]')).toBeVisible();
    await expect(overlay.locator('[data-testid="glass-overlay-thinking-card"]')).toBeVisible();

    await command.locator('[data-testid="glass-command-cancel"]').click();

    await expect(command.locator('[data-testid="glass-command-submit"]')).toBeVisible();
    await expect(overlay.getByText("Request cancelled.")).toBeVisible();

    await overlay.waitForTimeout(3500);
    await expect(overlay.locator('[data-testid="glass-overlay-response-card"]')).toHaveCount(0);
  });

  test("4 — panel opens with status grid", async () => {
    const { dock, panel } = await getGlassWindows(app.browser);

    await dock.locator('[data-testid="glass-dock-open-panel"]').click();
    await expect(panel.locator('[data-testid="glass-panel"]')).toBeVisible();
    await expect(panel.locator('[data-testid="glass-panel-status-grid"]')).toBeVisible();

    await expect(panel.locator('[data-testid="glass-panel-status-session"]')).toBeVisible();
    await expect(panel.locator('[data-testid="glass-panel-status-stt-provider"]')).toBeVisible();
    await expect(panel.locator('[data-testid="glass-panel-status-capture"]')).toBeVisible();
    await expect(panel.locator('[data-testid="glass-panel-status-system-audio"]')).toBeVisible();
    await expect(panel.locator('[data-testid="glass-panel-status-app-detection"]')).toBeVisible();

    await panel.locator('[data-testid="glass-panel-close"]').click();
  });

  test("5 — Stop Everything clears listening state", async () => {
    const { command, dock } = await getGlassWindows(app.browser);

    await command.evaluate(() => {
      window.glass.send({ type: "start-listening" });
    });

    await expect
      .poll(async () => (await readGlassState(command)).privacy.listening)
      .toBe(true);

    await dock.locator('[data-testid="glass-dock-stop-everything"]').click();

    await expect
      .poll(async () => (await readGlassState(command)).privacy.listening)
      .toBe(false);

    await expect(command.locator('[data-testid="glass-command-stop-listening"]')).toHaveCount(0);
    await expect(command.locator('[data-testid="glass-command-input"]')).toBeEnabled();
  });

  test("6 — Open in IIVO only on user action", async () => {
    const { command, overlay } = await getGlassWindows(app.browser);

    const input = command.locator('[data-testid="glass-command-input"]');
    await input.click();
    await input.fill("What am I working on?");
    await input.press("Enter");

    await expect(overlay.locator('[data-testid="glass-overlay-response-card"]')).toBeVisible({
      timeout: 15_000,
    });
    expect(await getE2eExternalUrls(command)).toHaveLength(0);

    await overlay.locator('[data-testid="glass-overlay-open-iivo"]').click();

    await expect.poll(async () => (await getE2eExternalUrls(command)).length).toBeGreaterThan(0);

    const urls = await getE2eExternalUrls(command);
    expect(urls.some((u) => u.includes("lensAsk=ctx-e2e-1"))).toBe(true);
  });

  test("7 — window layout diagnostics via Glass state", async () => {
    const { panel } = await getGlassWindows(app.browser);
    const state = await readGlassState(panel);

    expect(state.windows?.diagnostics ?? "").toMatch(/overlay=/i);
    expect(state.operationDiagnostics.displayInfo ?? "").toMatch(/overlay/i);
    expect(state.windows?.overlayVisible).toBe(true);
    expect(state.windows?.commandBarVisible).toBe(true);
  });
});
