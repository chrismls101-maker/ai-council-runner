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
});

test.afterAll(async () => {
  if (app) await closeGlassApp(app);
});

test.beforeEach(async () => {
  const { command, dock } = await getGlassWindows(app.browser);
  await resetE2eSetupState(command);
  await command.evaluate(() => window.glass.send({ type: "stop-everything" }));
  await command.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "off" }));
  await command.evaluate(() => window.glass.send({ type: "session-end" }));
  await dock.locator('[data-testid="glass-dock-open-panel"]').click();
  await expect(panelPage.locator('[data-testid="glass-panel"]')).toBeVisible();
  await panelPage.locator('[data-testid="glass-panel-tab-copilot"]').click();
  await expect(panelPage.locator('[data-testid="glass-panel-copilot-tab"]')).toBeVisible();
});

test("no audio/capture starts on initial launch", async () => {
  const state = await readGlassState(commandPage);
  expect(state.privacy.listening).toBe(false);
  expect(state.privacy.capturing).toBe(false);
});

test("panel shows four mode cards and Quick Tools Voice + Translate", async () => {
  await expect(panelPage.locator('[data-testid="glass-mode-panel"]')).toBeVisible();
  for (const id of ["listen", "meetings", "work", "fix"]) {
    await expect(panelPage.locator(`[data-testid="glass-mode-card-${id}"]`)).toBeVisible();
  }
  await expect(panelPage.locator('[data-testid="glass-mode-card-translate"]')).toHaveCount(0);
  await expect(panelPage.locator('[data-testid="glass-quick-tools"]')).toBeVisible();
  await expect(panelPage.locator('[data-testid="glass-mode-voice"]')).toBeVisible();
  await expect(panelPage.locator('[data-testid="glass-quick-tool-translate"]')).toBeVisible();
});

test("Work activates immediately without audio", async () => {
  await panelPage.locator('[data-testid="glass-mode-card-work"]').click();
  await expect
    .poll(async () => (await readGlassState(commandPage)).copilot.mode)
    .toBe("coaching");
  const state = await readGlassState(commandPage);
  expect(state.copilot.active).toBe(true);
  expect(state.privacy.listening).toBe(false);
});

test("Fix activates immediately in diagnostic mode without audio", async () => {
  await panelPage.locator('[data-testid="glass-mode-card-fix"]').click();
  await expect
    .poll(async () => (await readGlassState(commandPage)).copilot.mode)
    .toBe("diagnostic");
  const state = await readGlassState(commandPage);
  expect(state.privacy.listening).toBe(false);
});

test("Listen shows setup-needed when system audio is missing and never auto-listens", async () => {
  await commandPage.evaluate(() =>
    window.glass.send({
      type: "system-audio-set-status",
      status: "requires_virtual_device",
      detail: "No virtual audio device.",
    }),
  );
  await panelPage.locator('[data-testid="glass-mode-card-listen"]').click();
  await expect(panelPage.locator('[data-testid="glass-listen-setup-needed"]')).toBeVisible();
  await expect(panelPage.locator('[data-testid="glass-configure-audio"]')).toBeVisible();
  const state = await readGlassState(commandPage);
  expect(state.privacy.listening).toBe(false);
});

test("Meetings asks for Mic / Computer Audio when no source chosen", async () => {
  await panelPage.locator('[data-testid="glass-mode-card-meetings"]').click();
  await expect(panelPage.locator('[data-testid="glass-meeting-source-choice"]')).toBeVisible();
  await expect(panelPage.locator('[data-testid="glass-meeting-source-mic"]')).toBeVisible();
  await expect(panelPage.locator('[data-testid="glass-meeting-source-system"]')).toBeVisible();
  const state = await readGlassState(commandPage);
  expect(state.privacy.listening).toBe(false);
});

test("Stop Everything resets the active mode", async () => {
  await panelPage.locator('[data-testid="glass-mode-card-work"]').click();
  await expect
    .poll(async () => (await readGlassState(commandPage)).copilot.active)
    .toBe(true);

  await panelPage.locator('[data-testid="glass-mode-stop-everything"]').click();
  await expect
    .poll(async () => (await readGlassState(commandPage)).copilot.mode)
    .toBe("off");
  const state = await readGlassState(commandPage);
  expect(state.privacy.listening).toBe(false);
});

test("Advanced drawer reveals detailed settings, hidden by default", async () => {
  await expect(panelPage.locator('[data-testid="glass-copilot-drawer"]')).toHaveCount(0);
  await panelPage.locator('[data-testid="glass-advanced-toggle"]').click();
  await expect(panelPage.locator('[data-testid="glass-copilot-drawer"]')).toBeVisible();
  await expect(panelPage.locator('[data-testid="glass-copilot-mode-select"]')).toBeVisible();
  await expect(panelPage.locator('[data-testid="glass-copilot-focus-select"]')).toBeVisible();
});

test("Voice button requests Voice Mode without starting mic on launch", async () => {
  const before = (await readGlassState(commandPage)).voiceModeStartNonce ?? 0;
  await panelPage.locator('[data-testid="glass-mode-voice"]').click();
  await expect
    .poll(async () => (await readGlassState(commandPage)).voiceModeStartNonce ?? 0)
    .toBeGreaterThan(before);
});
