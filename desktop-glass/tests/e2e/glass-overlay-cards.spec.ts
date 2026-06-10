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
  connectIivoGlassForE2e,
  type LaunchedGlass,
} from "./helpers/electronApp.ts";
import { logE2eFailureDiagnostics } from "./helpers/e2eFailureDiagnostics.ts";
import { resetE2eSetupState } from "./helpers/e2eSetupReset.ts";

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

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await logE2eFailureDiagnostics(app, commandPage, testInfo.title);
  }
});

test.beforeEach(async () => {
  const { command } = await getGlassWindows(app.browser);
  await resetE2eSetupState(command);
  await command.evaluate(() => window.glass.send({ type: "clear-command-feed" }));
});

test.describe("IIVO Glass overlay response cards", () => {
  test("glass-overlay-copy", async () => {
    const { command, overlay } = await getGlassWindows(app.browser);
    await connectIivoGlassForE2e(app.browser);

    const prompt = "E2E overlay copy test";
    const input = command.locator('[data-testid="glass-command-input"]');
    await input.click();
    await input.fill(prompt);
    await input.press("Enter");

    const responseCard = overlay.locator('[data-testid="glass-overlay-response-card"]');
    await expect(responseCard).toBeVisible({ timeout: 15_000 });

    const responseText = await responseCard.innerText();
    expect(responseText).toContain("You are testing IIVO Glass");

    await overlay.locator('[data-testid="glass-overlay-copy"]').click();

    const clipboardText = await overlay.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain("You are testing IIVO Glass");
    expect(clipboardText).toContain(prompt);
  });

  test("glass-overlay-save-moment", async () => {
    const { command, overlay } = await getGlassWindows(app.browser);
    await connectIivoGlassForE2e(app.browser);

    const prompt = "E2E overlay save moment test";
    const input = command.locator('[data-testid="glass-command-input"]');
    await input.click();
    await input.fill(prompt);
    await input.press("Enter");

    const responseCard = overlay.locator('[data-testid="glass-overlay-response-card"]');
    await expect(responseCard).toBeVisible({ timeout: 15_000 });

    await overlay.locator('[data-testid="glass-overlay-save-moment"]').click();

    const state = await readGlassState(command);
    expect(state.lastNotice).toBe("Saved moment from IIVO answer.");
    expect(state.moments?.length).toBeGreaterThan(0);
    expect(String(state.moments?.[0]?.note ?? "")).toContain(prompt);
    expect(state.commandFeed?.some((item) => item.kind === "moment")).toBe(true);
  });
});
