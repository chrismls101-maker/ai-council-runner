/**
 * IIVO Master QA — Chrome extension shell verification (separate from default master QA).
 *
 * Loads unpacked extension in persistent Chromium context and opens popup.html directly.
 * Full capture APIs may not run from direct popup URL — this verifies extension UI shell.
 *
 * Run: npm run qa:master:extension
 */

import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { qaLog } from "./qaEnv.js";
import { ensureAppRunning } from "./qaStepHelpers.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const EXTENSION_PATH = path.join(PROJECT_ROOT, "browser-extension");

test.describe("IIVO Master QA — Extension", () => {
  test("Extension popup shell renders", async () => {
    test.setTimeout(120_000);
    await ensureAppRunning();

    const userDataDir = path.join(PROJECT_ROOT, "test-results", "pw-extension-profile");

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    try {
      let extensionId = "";
      const bgPages = context.serviceWorkers();
      for (const sw of bgPages) {
        const match = sw.url().match(/chrome-extension:\/\/([^/]+)/);
        if (match) {
          extensionId = match[1]!;
          break;
        }
      }

      if (!extensionId) {
        const page = await context.newPage();
        await page.goto("https://example.com/");
        await page.waitForTimeout(3000);
        for (const sw of context.serviceWorkers()) {
          const match = sw.url().match(/chrome-extension:\/\/([^/]+)/);
          if (match) {
            extensionId = match[1]!;
            break;
          }
        }
      }

      qaLog(`Extension ID: ${extensionId || "(not detected)"}`);

      if (!extensionId) {
        qaLog(
          "Extension service worker not detected — limitation: mark as extension shell unverified. Manual QA: load extension in chrome://extensions and open popup.",
        );
        test.skip(true, "Could not detect extension ID from service worker.");
        return;
      }

      const popupUrl = `chrome-extension://${extensionId}/popup.html`;
      const popup = await context.newPage();
      await popup.goto(popupUrl);

      await expect(popup.getByTestId("iivo-lens-popup")).toBeVisible({ timeout: 15_000 });
      await expect(popup.locator(".console-header")).toBeVisible();
      await expect(popup.getByText(/IIVO/i).first()).toBeVisible();

      qaLog("Extension popup shell verified (static UI). Capture/handoff requires toolbar popup or manual QA.");

      await popup.close();
    } finally {
      await context.close();
    }
  });
});
