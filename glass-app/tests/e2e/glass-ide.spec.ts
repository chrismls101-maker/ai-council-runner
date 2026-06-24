/**
 * Glass IDE / Coder shell E2E — project gate, workspace select, IDE chrome.
 * Does not run a live Coder agent (requires Anthropic key + costs tokens).
 */

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
import { resetE2eSetupState } from "./helpers/e2eSetupReset.ts";

let app: LaunchedGlass;
let overlayPage: import("@playwright/test").Page;

test.beforeAll(async () => {
  const skipReason = getElectronE2eSkipReason();
  test.skip(!!skipReason, skipReason ?? undefined);

  if (!fs.existsSync(GLASS_MAIN)) {
    throw new Error("Run `npm run build` in desktop-glass before IDE E2E.");
  }
  if (!fs.existsSync(GLASS_ELECTRON_BIN)) {
    throw new Error("Run `npm install` in desktop-glass before IDE E2E.");
  }

  app = await launchGlassApp();
  const { overlay } = await getGlassWindows(app.browser);
  overlayPage = overlay;
});

test.afterAll(async () => {
  if (app) await closeGlassApp(app);
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await logE2eFailureDiagnostics(app, overlayPage, testInfo.title);
  }
});

test.beforeEach(async () => {
  await resetE2eSetupState(overlayPage);
  await overlayPage.evaluate(() => {
    window.glass.glassIdeClose();
  });
  await expect(overlayPage.locator('[data-testid="glass-ide-shell"]')).toHaveCount(0);
});

test.describe("Glass IDE shell", () => {
  test("1 — opening IDE without a project shows project gate", async () => {
    await overlayPage.evaluate(async () => {
      const state = await window.glass.getState();
      if (state.glassSettings.agentCodeWorkspaceRoot) {
        // Clear workspace for gate test via pick is async; use select with empty invalid — skip
      }
      window.glass.glassIdeOpen();
    });

    await expect(overlayPage.locator('[data-testid="glass-ide-shell"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(overlayPage.locator('[data-testid="glass-ide-project-gate"]')).toBeVisible();
    await expect(overlayPage.locator('[data-testid="glass-ide-project-gate-open"]')).toBeVisible();
    await expect(overlayPage.locator('[data-testid="glass-ide-project-gate-create"]')).toBeVisible();
    await expect(overlayPage.locator('[data-testid="glass-ide-stream-composer"]')).toHaveCount(0);
  });

  test("2 — selecting a workspace enters full IDE (no folder picker in composer)", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "glass-ide-e2e-"));
    fs.writeFileSync(path.join(projectRoot, "hello.ts"), "export const hello = 1;\n");

    await overlayPage.evaluate(() => window.glass.glassIdeOpen());
    await expect(overlayPage.locator('[data-testid="glass-ide-project-gate"]')).toBeVisible({
      timeout: 15_000,
    });

    const selectRes = await overlayPage.evaluate(async (root) => {
      return window.glass.glassIdeSelectWorkspace({ folder: root });
    }, projectRoot);
    expect(selectRes.ok).toBe(true);

    await expect(overlayPage.locator('[data-testid="glass-ide-project-gate"]')).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(overlayPage.locator('[data-testid="glass-ide-stream-composer"]')).toBeVisible();
    await expect(overlayPage.locator('[data-testid="glass-ide-model-select"]')).toBeVisible();
    await expect(overlayPage.locator(".gide-model-select__label")).toHaveText("Auto");
    await expect(overlayPage.locator('[data-testid="glass-ide-cost-footer"]')).toBeVisible();
    await expect(overlayPage.locator(".gide-workspace-btn")).toHaveCount(0);
    await expect(overlayPage.locator('[data-testid="glass-ide-stream"]')).toBeVisible();
    await expect(overlayPage.locator(".gide-qa-mode-btn")).toBeVisible();

    const state = await readGlassState(overlayPage);
    expect(state.glassSettings.agentCodeWorkspaceRoot).toBe(projectRoot);
    expect(state.glassSettings.coderAgentModel ?? "auto").toBe("auto");
    expect(state.glassIdeActive).toBe(true);
    expect(state.glassSettings.recentCoderProjects?.[0]).toBe(projectRoot);
  });

  test("3 — project name in header reopens switcher", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "glass-ide-e2e-"));
    fs.writeFileSync(path.join(projectRoot, "app.ts"), "export {};\n");

    await overlayPage.evaluate(() => window.glass.glassIdeOpen());
    await overlayPage.evaluate(async (root) => {
      await window.glass.glassIdeSelectWorkspace({ folder: root });
    }, projectRoot);

    await expect(overlayPage.locator('[data-testid="glass-ide-project-gate"]')).toHaveCount(0);
    await overlayPage.locator(".gide-project-switch-btn").click();
    await expect(overlayPage.locator('[data-testid="glass-ide-project-gate"]')).toBeVisible();
    await overlayPage.locator(".gide-project-gate__link", { hasText: "Cancel" }).click();
    await expect(overlayPage.locator('[data-testid="glass-ide-project-gate"]')).toHaveCount(0);
  });
});
