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
  resetE2eExternalUrls,
  type LaunchedGlass,
} from "./helpers/electronApp.ts";
import { resetE2eSetupState } from "./helpers/e2eSetupReset.ts";
import { assertLiveServerReachable, resolveLiveApiUrls } from "./helpers/liveE2eServer.ts";

const STUB_CANARY = "IIVO Glass is working";
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
  test.skip(process.env.IIVO_GLASS_LIVE_E2E !== "1", "Set IIVO_GLASS_LIVE_E2E=1 for live UI tests");

  const skipReason = getElectronE2eSkipReason();
  test.skip(!!skipReason, skipReason ?? undefined);

  const { apiUrl } = resolveLiveApiUrls();
  await assertLiveServerReachable(apiUrl);

  if (!fs.existsSync(GLASS_MAIN)) {
    throw new Error("Run npm run build --prefix desktop-glass first.");
  }
  if (!fs.existsSync(GLASS_ELECTRON_BIN)) {
    throw new Error("Electron binary missing — npm install --prefix desktop-glass");
  }

  process.env.IIVO_GLASS_LIVE_E2E = "1";
  app = await launchGlassApp();
  const windows = await getGlassWindows(app.browser);
  commandPage = windows.command;
});

test.afterAll(async () => {
  if (app) await closeGlassApp(app);
});

test.beforeEach(async () => {
  await resetE2eSetupState(commandPage);
  await resetE2eExternalUrls(commandPage);
});

test.describe("IIVO Glass LIVE UI (real server)", () => {
  test("server setup row is Online after setup check", async () => {
    const { command, dock, panel } = await getGlassWindows(app.browser);
    await dock.locator('[data-testid="glass-dock-open-panel"]').click();
    await expect(panel.locator('[data-testid="glass-panel-setup"]')).toBeVisible();

    await command.evaluate(() => window.glass.send({ type: "run-setup-check" }));

    await expect
      .poll(async () => {
        const server = (await readGlassState(command)).setupCapabilities?.find((r) => r.id === "server");
        return server?.label;
      }, { timeout: 20_000 })
      .toBe("Online");

    const vision = (await readGlassState(command)).setupCapabilities?.find((r) => r.id === "vision");
    expect(vision?.status).not.toBe("error");
  });

  test("direct ask returns a live AI answer (not stub)", async () => {
    const { command, overlay } = await getGlassWindows(app.browser);

    const input = command.locator('[data-testid="glass-command-input"]');
    await input.click();
    await input.fill(
      "What is IIVO Glass for on my desktop? Answer in 2–3 practical sentences — no council format.",
    );
    await input.press("Enter");

    await expect(overlay.locator('[data-testid="glass-overlay-thinking-card"]')).toBeVisible();
    await expect(overlay.locator('[data-testid="glass-overlay-response-card"]')).toBeVisible({
      timeout: 45_000,
    });

    const responseText = await overlay.locator('[data-testid="glass-overlay-response-card"]').innerText();
    expect(responseText).not.toContain(STUB_CANARY);
    expect(responseText.trim().length).toBeGreaterThan(60);
    for (const marker of COUNCIL_MARKERS) {
      expect(responseText).not.toContain(marker);
    }

    const state = await readGlassState(command);
    expect(state.lastError ?? "").not.toMatch(/fetch|unavailable|Missing API keys/i);
  });

  test("second live ask is substantive (not stub)", async () => {
    const { command, overlay } = await getGlassWindows(app.browser);

    const input = command.locator('[data-testid="glass-command-input"]');
    await input.click();
    await input.fill(
      "List three example command-bar questions I could ask Glass about what is on my screen — short bullets only.",
    );
    await input.press("Enter");

    await expect(overlay.locator('[data-testid="glass-overlay-response-card"]')).toBeVisible({
      timeout: 45_000,
    });

    const responseText = await overlay.locator('[data-testid="glass-overlay-response-card"]').innerText();
    expect(responseText.trim().length).toBeGreaterThan(40);
    expect(responseText).not.toContain(STUB_CANARY);
    for (const marker of COUNCIL_MARKERS) {
      expect(responseText).not.toContain(marker);
    }
  });
});
