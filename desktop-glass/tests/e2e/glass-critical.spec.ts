import { test, expect } from "@playwright/test";
import fs from "node:fs";
import {
  closeGlassApp,
  getE2eExternalUrls,
  getE2eWindowMetadata,
  getGlassWindows,
  getElectronE2eSkipReason,
  GLASS_ELECTRON_BIN,
  GLASS_MAIN,
  launchGlassApp,
  readGlassState,
  resetE2eExternalUrls,
  type LaunchedGlass,
} from "./helpers/electronApp.ts";

const COUNCIL_MARKERS = [
  "Final Action Plan",
  "Decision Quality",
  "Sales Attack",
  "Product Decision",
  "Final Judge",
];

const SPEC_STATUS_KEYS = ["server", "stt", "capture", "audio", "permissions", "session"];

let app: LaunchedGlass;
let commandPage: import("@playwright/test").Page;

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
    await input.fill("Help me plan the rest of my day.");
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

  test("4 — panel opens with spec status grid", async () => {
    const { dock, panel } = await getGlassWindows(app.browser);

    await dock.locator('[data-testid="glass-dock-open-panel"]').click();
    await expect(panel.locator('[data-testid="glass-panel"]')).toBeVisible();
    await expect(panel.locator('[data-testid="glass-panel-status-grid"]')).toBeVisible();

    for (const key of SPEC_STATUS_KEYS) {
      await expect(panel.locator(`[data-testid="glass-panel-status-${key}"]`)).toBeVisible();
    }

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
    await input.fill("Help me plan the rest of my day.");
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

  test("7 — visual ask captures on demand and answers inline", async () => {
    const { command, overlay } = await getGlassWindows(app.browser);

    const input = command.locator('[data-testid="glass-command-input"]');
    await input.click();
    await input.fill("What's on my screen?");
    await input.press("Enter");

    await expect(overlay.locator('[data-testid="glass-overlay-looking-card"]')).toBeVisible({
      timeout: 8_000,
    });
    await expect(overlay.locator('[data-testid="glass-overlay-response-card"]')).toBeVisible({
      timeout: 15_000,
    });

    const responseText = await overlay
      .locator('[data-testid="glass-overlay-response-card"]')
      .innerText();
    expect(responseText).toMatch(/see the test screen/i);

    const state = await readGlassState(command);
    expect(state.screenContextStatus?.kind).not.toBe("none");
    expect(await getE2eExternalUrls(command)).toHaveLength(0);
  });

  test("8 — visual ask retries after 413 payload too large", async () => {
    const { command, overlay } = await getGlassWindows(app.browser);

    const input = command.locator('[data-testid="glass-command-input"]');
    await input.click();
    await input.fill("E2E_FORCE_413_ONCE What do you see on my screen?");
    await input.press("Enter");

    await expect(overlay.locator('[data-testid="glass-overlay-response-card"]')).toBeVisible({
      timeout: 20_000,
    });

    const responseText = await overlay
      .locator('[data-testid="glass-overlay-response-card"]')
      .innerText();
    expect(responseText).toMatch(/see the test screen/i);
  });

  test("9 — window metadata via E2E IPC", async () => {
    const { command } = await getGlassWindows(app.browser);
    const metadata = await getE2eWindowMetadata(command);
    const state = await readGlassState(command);

    const overlay = metadata.find((m) => m.name === "overlay");
    const commandBar = metadata.find((m) => m.name === "commandBar");
    const dock = metadata.find((m) => m.name === "dock");
    const panelWin = metadata.find((m) => m.name === "panel");

    expect(overlay?.exists).toBe(true);
    expect(overlay?.visible).toBe(true);
    expect(overlay?.ignoreMouseEvents).toBe(true);
    expect(commandBar?.exists).toBe(true);
    expect(commandBar?.visible).toBe(true);
    // Command bar must accept typing whether or not transparent margins use forward click-through.
    await expect(command.locator('[data-testid="glass-command-input"]')).toBeEnabled();
    expect(dock?.exists).toBe(true);
    expect(panelWin?.exists).toBe(true);

    expect(overlay?.bounds).not.toBeNull();
    expect(commandBar?.bounds).not.toBeNull();
    expect(overlay!.bounds!.width).toBeGreaterThan(100);
    expect(overlay!.bounds!.height).toBeGreaterThan(100);

    const bar = commandBar!.bounds!;
    const overlayBounds = overlay!.bounds!;
    expect(bar.y + bar.height).toBeLessThanOrEqual(overlayBounds.y + overlayBounds.height + 8);
    const barCenter = bar.x + bar.width / 2;
    const overlayCenter = overlayBounds.x + overlayBounds.width / 2;
    expect(Math.abs(barCenter - overlayCenter)).toBeLessThan(overlayBounds.width * 0.1);

    expect(state.windows?.overlayVisible).toBe(true);
    expect(state.windows?.overlayClickThrough).toBe(true);
    expect(state.windows?.commandBarVisible).toBe(true);
  });
});
