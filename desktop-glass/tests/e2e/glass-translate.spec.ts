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
import { resetE2eSetupState } from "./helpers/e2eSetupReset.ts";

let app: LaunchedGlass;
let commandPage: import("@playwright/test").Page;
let panelPage: import("@playwright/test").Page;
let overlayPage: import("@playwright/test").Page;

test.describe("IIVO Glass Live Translate", () => {
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
    panelPage = windows.panel;
    overlayPage = windows.overlay;
  });

  test.afterAll(async () => {
    if (app) await closeGlassApp(app);
  });

  test.beforeEach(async () => {
    const { command, dock } = await getGlassWindows(app.browser);
    await resetE2eSetupState(command);
    await command.evaluate(() => window.glass.send({ type: "stop-everything" }));
    await command.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "off" }));
    await dock.locator('[data-testid="glass-dock-open-panel"]').click();
    await panelPage.locator('[data-testid="glass-panel-tab-copilot"]').click();
  });

  test("Translate accessible from Quick Tools", async () => {
    await expect(panelPage.locator('[data-testid="glass-quick-tools"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="glass-quick-tool-translate"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="glass-quick-tool-translate"]')).toContainText(
      "Translate",
    );
  });

  test("setup flow selects Media / Conversation and target language", async () => {
    await panelPage.locator('[data-testid="glass-quick-tool-translate"]').click();
    await expect(panelPage.locator('[data-testid="glass-translate-setup"]')).toBeVisible();
    await panelPage.locator('[data-testid="glass-translate-mode-conversation"]').click();
    await panelPage.locator('[data-testid="glass-translate-target-language"]').selectOption("en");
    await panelPage.locator('[data-testid="glass-translate-display-mode"]').selectOption(
      "original_and_translation",
    );
    await panelPage.locator('[data-testid="glass-translate-start"]').click();
    const state = await readGlassState(commandPage);
    expect(state.liveTranslate?.config.mode).toBe("conversation");
    expect(state.liveTranslate?.config.targetLanguage).toBe("en");
    expect(state.liveTranslate?.config.saveMode).toBe("private_no_save");
  });

  test("mock translated captions appear after start", async () => {
    await panelPage.locator('[data-testid="glass-quick-tool-translate"]').click();
    await panelPage.locator('[data-testid="glass-translate-target-language"]').selectOption("es");
    await panelPage.locator('[data-testid="glass-translate-start"]').click();

    await commandPage.evaluate(() =>
      window.glass.send({
        type: "add-transcript-chunk",
        text: "Hello, this is a test caption for translation.",
        tags: ["system_audio"],
      }),
    );

    await expect(overlayPage.locator('[data-testid="glass-live-translate-captions"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(overlayPage.locator('[data-testid="glass-translate-language-pair"]')).toContainText(
      "Translating",
    );
    await expect(overlayPage.locator('[data-testid="glass-translate-caption-text"]')).toContainText(
      "[es]",
    );
  });

  test("original + translation renders both lines", async () => {
    await panelPage.locator('[data-testid="glass-quick-tool-translate"]').click();
    await panelPage.locator('[data-testid="glass-translate-mode-conversation"]').click();
    await panelPage.locator('[data-testid="glass-translate-display-mode"]').selectOption(
      "original_and_translation",
    );
    await panelPage.locator('[data-testid="glass-translate-start"]').click();

    await commandPage.evaluate(() =>
      window.glass.send({
        type: "add-transcript-chunk",
        text: "Hola, esto es una prueba de traducción.",
        tags: ["system_audio"],
      }),
    );

    await expect(overlayPage.locator('[data-testid="glass-translate-caption-original"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(overlayPage.locator('[data-testid="glass-translate-caption-text"]')).toBeVisible();
  });

  test("Stop Translation clears captions", async () => {
    await panelPage.locator('[data-testid="glass-quick-tool-translate"]').click();
    await panelPage.locator('[data-testid="glass-translate-start"]').click();
    await commandPage.evaluate(() =>
      window.glass.send({
        type: "add-transcript-chunk",
        text: "Temporary caption line.",
        tags: ["system_audio"],
      }),
    );
    await panelPage.locator('[data-testid="glass-translate-stop"]').click();
    const state = await readGlassState(commandPage);
    expect(state.liveTranslate?.active ?? false).toBe(false);
  });

  test("Stop Everything clears translate state", async () => {
    await panelPage.locator('[data-testid="glass-quick-tool-translate"]').click();
    await panelPage.locator('[data-testid="glass-translate-start"]').click();
    await commandPage.evaluate(() =>
      window.glass.send({
        type: "add-transcript-chunk",
        text: "Temporary caption line.",
        tags: ["system_audio"],
      }),
    );
    await panelPage.locator('[data-testid="glass-mode-stop-everything"]').click();
    const state = await readGlassState(commandPage);
    expect(state.liveTranslate?.active ?? false).toBe(false);
  });
});
