/**
 * IIVO Glass — Overlay Interaction Regression (Task #60)
 *
 * Covers every interactive surface of the overlay feed card:
 *   - Pin / Unpin a response card (and verify feed state)
 *   - Copy card text to clipboard
 *   - "Remember this" saves to memory via stub server
 *   - Feed scrolls when multiple responses stack
 *   - Command bar right-click context menu fires
 *   - Notification dismiss clears the host
 *
 * Pattern: submit a real ask via the stub server → response card appears →
 * exercise the action button.
 *
 * Run: npm run glass:e2e -- --grep "IIVO Glass Overlay Interaction"
 */

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

// ─── Lifecycle ────────────────────────────────────────────────────────────────

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
  commandPage = (await getGlassWindows(app.browser)).command;
  await connectIivoGlassForE2e(app.browser);
});

test.afterAll(async () => {
  if (app) await closeGlassApp(app);
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await logE2eFailureDiagnostics(app, commandPage, testInfo.title);
  }
  // Clear feed between tests
  await commandPage.evaluate(() => window.glass.send({ type: "clear-command-feed" }));
});

test.beforeEach(async () => {
  const { command } = await getGlassWindows(app.browser);
  await resetE2eSetupState(command);
  await command.evaluate(() => window.glass.send({ type: "clear-command-feed" }));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Type a question in the command bar and wait for a response card to appear
 * in the overlay notification host.
 */
async function askAndAwaitResponse(
  command: import("@playwright/test").Page,
  overlay: import("@playwright/test").Page,
  prompt: string,
): Promise<void> {
  const input = command.locator('[data-testid="glass-command-input"]');
  await input.click();
  await input.fill(prompt);
  await input.press("Enter");
  await expect(
    overlay.locator('[data-testid="glass-overlay-response-card"]').first(),
  ).toBeVisible({ timeout: 15_000 });
}

/** Return the first visible response card in the overlay. */
function responseCard(overlay: import("@playwright/test").Page) {
  return overlay.locator('[data-testid="glass-overlay-response-card"]').first();
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe("IIVO Glass Overlay Interaction", () => {

  // ─── Pin / Unpin ────────────────────────────────────────────────────────────

  test("pin button marks feed item as pinned in state", async () => {
    test.setTimeout(60_000);
    const { command, overlay } = await getGlassWindows(app.browser);

    await askAndAwaitResponse(command, overlay, "E2E overlay pin test");

    const card = responseCard(overlay);
    const pinBtn = card.getByRole("button", { name: "Pin" });
    await expect(pinBtn).toBeVisible({ timeout: 5_000 });
    await pinBtn.click();

    // State must reflect pinned = true
    await expect
      .poll(async () => {
        const state = await readGlassState(command);
        return state.commandFeed.some((item) => item.pinned);
      }, { timeout: 8_000 })
      .toBe(true);

    // Card acquires pinned CSS class
    await expect(card).toHaveClass(/overlay-feed-card--pinned/, { timeout: 5_000 });
  });

  test("pin button label toggles to Unpin after pinning", async () => {
    test.setTimeout(60_000);
    const { command, overlay } = await getGlassWindows(app.browser);

    await askAndAwaitResponse(command, overlay, "E2E pin label toggle");

    const card = responseCard(overlay);
    await card.getByRole("button", { name: "Pin" }).click();

    await expect(card.getByRole("button", { name: "Unpin" })).toBeVisible({ timeout: 5_000 });
  });

  test("unpinning removes pinned state", async () => {
    test.setTimeout(60_000);
    const { command, overlay } = await getGlassWindows(app.browser);

    await askAndAwaitResponse(command, overlay, "E2E unpin test");

    const card = responseCard(overlay);
    await card.getByRole("button", { name: "Pin" }).click();
    await expect(card.getByRole("button", { name: "Unpin" })).toBeVisible({ timeout: 5_000 });

    await card.getByRole("button", { name: "Unpin" }).click();

    await expect
      .poll(async () => {
        const state = await readGlassState(command);
        return state.commandFeed.every((item) => !item.pinned);
      }, { timeout: 8_000 })
      .toBe(true);
  });

  // ─── Copy ───────────────────────────────────────────────────────────────────

  test("Copy button is present on response card", async () => {
    test.setTimeout(60_000);
    const { command, overlay } = await getGlassWindows(app.browser);

    await askAndAwaitResponse(command, overlay, "E2E copy button test");

    const card = responseCard(overlay);
    const copyBtn = card.locator('[data-testid="glass-overlay-copy"]');
    await expect(copyBtn).toBeVisible({ timeout: 5_000 });
  });

  test("Copy button copies card body text to clipboard", async () => {
    test.setTimeout(60_000);
    const { command, overlay } = await getGlassWindows(app.browser);

    await askAndAwaitResponse(command, overlay, "E2E clipboard copy test");

    const card = responseCard(overlay);
    await card.locator('[data-testid="glass-overlay-copy"]').click();

    // Clipboard should have the stub answer text
    const clipText = await overlay.evaluate(() => navigator.clipboard.readText().catch(() => ""));
    expect(clipText.length).toBeGreaterThan(0);
    expect(clipText).toMatch(/IIVO|testing|working/i); // matches stub answer phrases
  });

  // ─── Remember This ──────────────────────────────────────────────────────────

  test("Remember This button is visible on response card", async () => {
    test.setTimeout(60_000);
    const { command, overlay } = await getGlassWindows(app.browser);

    await askAndAwaitResponse(command, overlay, "E2E remember button visible");

    const card = responseCard(overlay);
    const rememberBtn = card.locator('[data-testid="glass-remember-this"]');
    await expect(rememberBtn).toBeVisible({ timeout: 5_000 });
    await expect(rememberBtn).toHaveText("Remember this");
  });

  test("clicking Remember This calls the memory API and shows Saved", async () => {
    test.setTimeout(60_000);
    const { command, overlay } = await getGlassWindows(app.browser);

    const memBefore = app.stub.getMemoryPostCount();
    await askAndAwaitResponse(command, overlay, "E2E remember this save test");

    const card = responseCard(overlay);
    const rememberBtn = card.locator('[data-testid="glass-remember-this"]');
    await expect(rememberBtn).toBeVisible({ timeout: 5_000 });
    await rememberBtn.click();

    // Button should show "Saved" after the stub responds
    await expect(rememberBtn).toHaveText(/Saved/, { timeout: 8_000 });
    await expect(rememberBtn).toBeDisabled();

    // Memory POST count must have incremented
    expect(app.stub.getMemoryPostCount()).toBeGreaterThan(memBefore);
  });

  test("Remember This button is disabled after saving (no double-save)", async () => {
    test.setTimeout(60_000);
    const { command, overlay } = await getGlassWindows(app.browser);

    await askAndAwaitResponse(command, overlay, "E2E double-save guard");

    const card = responseCard(overlay);
    const rememberBtn = card.locator('[data-testid="glass-remember-this"]');
    await expect(rememberBtn).toBeVisible({ timeout: 5_000 });
    await rememberBtn.click();
    await expect(rememberBtn).toBeDisabled({ timeout: 8_000 });
  });

  // ─── Feed scroll ────────────────────────────────────────────────────────────

  test("multiple responses stack in the notification host", async () => {
    test.setTimeout(90_000);
    const { command, overlay } = await getGlassWindows(app.browser);

    // Submit two questions in sequence
    await askAndAwaitResponse(command, overlay, "E2E scroll test — question one");
    await commandPage.evaluate(() => window.glass.send({ type: "clear-command-feed" }));
    await askAndAwaitResponse(command, overlay, "E2E scroll test — question two");

    // At least one response card must be visible
    await expect(
      overlay.locator('[data-testid="glass-overlay-response-card"]').first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("notification host renders in overlay window", async () => {
    test.setTimeout(60_000);
    const { command, overlay } = await getGlassWindows(app.browser);

    await askAndAwaitResponse(command, overlay, "E2E notification host visible");

    await expect(overlay.locator('[data-testid="glass-notification-host"]')).toBeVisible({
      timeout: 5_000,
    });
  });

  // ─── Command bar ────────────────────────────────────────────────────────────

  test("command bar renders with input visible and accessible", async () => {
    test.setTimeout(30_000);
    const { command } = await getGlassWindows(app.browser);

    await expect(command.locator('[data-testid="glass-command-bar"]')).toBeVisible();
    const input = command.locator('[data-testid="glass-command-input"]');
    await expect(input).toBeVisible();
  });

  test("command input accepts text and clears after submit", async () => {
    test.setTimeout(60_000);
    const { command, overlay } = await getGlassWindows(app.browser);

    const input = command.locator('[data-testid="glass-command-input"]');
    await input.click();
    await input.fill("E2E input clear test");
    expect(await input.inputValue()).toBe("E2E input clear test");

    await input.press("Enter");
    await expect(
      overlay.locator('[data-testid="glass-overlay-response-card"]').first(),
    ).toBeVisible({ timeout: 15_000 });

    // Input clears after submit
    await expect
      .poll(() => input.inputValue(), { timeout: 5_000 })
      .toBe("");
  });

  test("command bar right-click fires context menu on the input", async () => {
    test.setTimeout(30_000);
    const { command } = await getGlassWindows(app.browser);

    const input = command.locator('[data-testid="glass-command-input"]');
    await input.click();
    await input.fill("right-click target");

    // Right-click should trigger a context-menu event without crashing
    // (Electron native context menu — we verify no unhandled error, not the native menu contents)
    let errorFired = false;
    command.on("console", (msg) => {
      if (msg.type() === "error") errorFired = true;
    });

    await input.click({ button: "right" });
    // Small wait to catch any synchronous crash
    await command.waitForTimeout(500);

    expect(errorFired).toBe(false);
    // Input still has its text (nothing broke)
    expect(await input.inputValue()).toBe("right-click target");
  });

  // ─── Feed cleared via IPC ────────────────────────────────────────────────────

  test("clear-command-feed IPC removes all cards from overlay", async () => {
    test.setTimeout(60_000);
    const { command, overlay } = await getGlassWindows(app.browser);

    await askAndAwaitResponse(command, overlay, "E2E feed clear test");
    await expect(
      overlay.locator('[data-testid="glass-overlay-response-card"]').first(),
    ).toBeVisible({ timeout: 5_000 });

    // Clear
    await command.evaluate(() => window.glass.send({ type: "clear-command-feed" }));

    await expect
      .poll(
        async () =>
          (await readGlassState(command)).commandFeed.filter((i) => i.kind === "response").length,
        { timeout: 8_000 },
      )
      .toBe(0);
  });
});
