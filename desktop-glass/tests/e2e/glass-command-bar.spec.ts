import { test, expect } from "@playwright/test";
import fs from "node:fs";
import {
  closeGlassApp,
  connectIivoGlassForE2e,
  getGlassWindows,
  getElectronE2eSkipReason,
  GLASS_ELECTRON_BIN,
  GLASS_MAIN,
  launchGlassApp,
  readGlassState,
  type LaunchedGlass,
} from "./helpers/electronApp.ts";
import { resetE2eSetupState } from "./helpers/e2eSetupReset.ts";

let app: LaunchedGlass;
let commandPage: import("@playwright/test").Page;

test.describe("IIVO Glass command bar controls", () => {
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
    const windows = await getGlassWindows(app.browser);
    commandPage = windows.command;
  });

  test.afterAll(async () => {
    if (app) await closeGlassApp(app);
  });

  test.beforeEach(async () => {
    const { command } = await getGlassWindows(app.browser);
    await resetE2eSetupState(command);
    await connectIivoGlassForE2e(app.browser);
    await command.evaluate(() => window.glass.send({ type: "stop-everything" }));
    await command.evaluate(() => window.glass.send({ type: "translate-stop" }));
  });

  test("command input is focusable and accepts text", async () => {
    const { command } = await getGlassWindows(app.browser);
    const input = command.locator('[data-testid="glass-command-input"]');
    await input.click();
    await input.fill("command bar typing check");
    await expect(input).toHaveValue("command bar typing check");
  });

  test("translate button starts and stops from command bar", async () => {
    const { command } = await getGlassWindows(app.browser);

    await command.locator('[data-testid="glass-command-translate"]').click();
    await expect
      .poll(async () => (await readGlassState(command)).liveTranslate?.active)
      .toBe(true);
    await expect(command.locator('[data-testid="glass-command-translate-status"]')).toBeVisible();
    await expect(command.locator('[data-testid="glass-command-bar-pills"]')).toBeVisible();

    await command.locator('[data-testid="glass-command-translate-stop"]').click();
    await expect
      .poll(async () => Boolean((await readGlassState(command)).liveTranslate?.active))
      .toBe(false);
    await expect(command.locator('[data-testid="glass-command-translate-status"]')).toHaveCount(0);
  });

  test("listening pill appears beside command bar and stop is clickable", async () => {
    const { command } = await getGlassWindows(app.browser);

    await command.evaluate(() => window.glass.send({ type: "start-listening" }));
    await expect
      .poll(async () => (await readGlassState(command)).privacy.listening)
      .toBe(true);

    const hud = command.locator('[data-testid="glass-command-bar-hud"]');
    await expect(hud).toBeVisible();
    const listenPill = command.locator('[data-testid="glass-command-listen-status"]');
    await expect(listenPill).toBeVisible();
    await expect(hud.locator('[data-testid="glass-command-bar-pills"]')).toContainText(/\d|Listening/);

    await command.locator('[data-testid="glass-command-stop-listening"]').click();
    await expect
      .poll(async () => (await readGlassState(command)).privacy.listening)
      .toBe(false);
  });

  test("chrome lock, lens, mic, and submit buttons are clickable", async () => {
    const { command } = await getGlassWindows(app.browser);

    const lock = command.locator('[data-testid="glass-command-chrome-lock"]');
    await expect(lock).toBeVisible();
    const lockedBefore = (await readGlassState(command)).glassSettings.chromeLayoutLocked;
    await lock.click();
    await expect
      .poll(async () => (await readGlassState(command)).glassSettings.chromeLayoutLocked)
      .not.toBe(lockedBefore);

    const input = command.locator('[data-testid="glass-command-input"]');
    await input.click();
    await input.fill("submit probe");
    await expect(command.locator('[data-testid="glass-command-submit"]')).toBeEnabled();
    await command.locator('[data-testid="glass-command-submit"]').click();

    await expect(command.locator('[data-testid="glass-command-lens"]')).toBeVisible();
    await command.locator('[data-testid="glass-command-lens"]').click();

    await expect(command.locator('[data-testid="glass-command-listen"]')).toBeVisible();
    await command.locator('[data-testid="glass-command-listen"]').click();
  });
});
