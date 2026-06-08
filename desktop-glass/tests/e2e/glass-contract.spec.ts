import { test, expect, type Page } from "@playwright/test";
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
import {
  isCdpPortInUse,
  killStaleProcessesOnCdpPort,
  GLASS_CDP_PORT,
} from "./helpers/launchGlassElectronForE2E.ts";
import { logE2eFailureDiagnostics } from "./helpers/e2eFailureDiagnostics.ts";
import { resetE2eSetupState } from "./helpers/e2eSetupReset.ts";

const AUTO_DISMISS_WAIT_MS = 18_500;

async function submitGlassAsk(
  command: Page,
  overlay: Page,
  prompt: string,
): Promise<void> {
  const input = command.locator('[data-testid="glass-command-input"]');
  await input.click();
  await input.fill(prompt);
  await input.press("Enter");
  await expect(overlay.locator('[data-testid="glass-overlay-response-card"]')).toBeVisible({
    timeout: 15_000,
  });
}

let app: LaunchedGlass | undefined;
let commandPage: Page;

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
  await connectIivoGlassForE2e(app.browser);
});

test.afterAll(async () => {
  if (app) {
    await closeGlassApp(app);
    app = undefined;
  }
  killStaleProcessesOnCdpPort();
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

test.describe("IIVO Glass contract backlog", () => {
  // Contract §5 — Pin survives auto-dismiss
  test("pin survives 17s auto-dismiss", async () => {
    test.setTimeout(90_000);

    const { command, overlay } = await getGlassWindows(app.browser);

    await submitGlassAsk(command, overlay, "E2E pin survive A");
    await overlay.locator('[data-testid="glass-overlay-response-card"]').getByRole("button", { name: "Pin" }).click();

    await expect
      .poll(async () => {
        const feed = (await readGlassState(command)).commandFeed;
        return feed.some((item) => item.pinned && item.kind === "response");
      })
      .toBe(true);

    await submitGlassAsk(command, overlay, "E2E pin survive B");
    await expect(overlay.locator('[data-testid="glass-overlay-response-card"]')).toContainText(
      "E2E pin survive B",
    );

    await overlay.waitForTimeout(AUTO_DISMISS_WAIT_MS);

    await expect(overlay.locator('[data-testid="glass-overlay-response-card"]')).toHaveCount(1);
    await expect(overlay.locator('[data-testid="glass-overlay-response-card"]')).toContainText(
      "E2E pin survive A",
    );
  });

  // Contract §7 — Remember this POST succeeds and button shows Saved
  test("remember this saves to memory vault", async () => {
    const { command, overlay } = await getGlassWindows(app.browser);

    await submitGlassAsk(command, overlay, "E2E remember this test");
    const remember = overlay.locator('[data-testid="glass-remember-this"]');
    await expect(remember).toBeVisible();
    await remember.click();
    await expect(remember).toHaveText("Saved");

    expect(app.stub.getMemoryPostCount()).toBe(1);
    const body = app.stub.getLastMemoryBody();
    expect(body?.sourceType).toBe("glass");
    expect(body?.type).toBe("evidence");
    expect(String(body?.content ?? "")).toContain("E2E remember this test");
    expect(String(body?.title ?? "")).toContain("E2E remember this test");
  });

  // Contract §6 — Auto-dismiss fires at 17 seconds without pin
  test("unpinned response auto-dismisses after 17 seconds", async () => {
    test.setTimeout(90_000);

    const { command, overlay } = await getGlassWindows(app.browser);

    await submitGlassAsk(command, overlay, "E2E auto dismiss test");
    await expect(overlay.locator('[data-testid="glass-overlay-response-card"]')).toBeVisible();

    await overlay.waitForTimeout(AUTO_DISMISS_WAIT_MS);

    await expect(overlay.locator('[data-testid="glass-overlay-response-card"]')).toHaveCount(0);
  });

  // Contract §17 — Quit leaves no orphaned Electron or CDP processes
  test("quit leaves no orphaned Electron or CDP processes", async () => {
    const pid = app.electronProcess.pid;
    expect(pid).toBeTruthy();

    await closeGlassApp(app);
    app = undefined;

    await expect.poll(() => isCdpPortInUse(GLASS_CDP_PORT)).toBe(false);
    await expect.poll(() => {
      try {
        process.kill(pid!, 0);
        return false;
      } catch {
        return true;
      }
    }).toBe(true);

    killStaleProcessesOnCdpPort();
  });
});
