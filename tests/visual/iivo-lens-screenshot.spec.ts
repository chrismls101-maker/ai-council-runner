/**
 * IIVO Visual QA — Lens screenshot handoff (no extension install required)
 *
 * Requires: npm run dev (client :5173 + server :3001)
 */

import { test, expect } from "@playwright/test";
import { ensureAppRunning, pause } from "./qaStepHelpers.js";
import { qaLog } from "./qaEnv.js";
import { fetchVisionConfig, isVisionEnabled } from "./masterQaHealth.js";

const API_BASE = "http://localhost:3001";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function createLensScreenshotItem(title: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "screenshot",
      title,
      sourceUrl: "https://example.com/lens-screenshot-qa",
      contentText: `Screenshot captured from page: ${title}`,
      tags: ["lens", "browser", "screenshot"],
      capturedVia: "browser_lens",
      capturedAt: new Date().toISOString(),
      sourceConfidence: "screenshot",
      lensCaptureType: "screenshot",
      captureType: "visible_tab_screenshot",
      pageTitle: title,
    }),
  });
  if (!res.ok) throw new Error("Failed to create screenshot context fixture");
  const item = (await res.json()) as { id: string };

  const upload = await fetch(`${API_BASE}/api/context/${item.id}/screenshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl: TINY_PNG }),
  });
  if (!upload.ok) throw new Error("Failed to upload screenshot fixture");

  qaLog(`Created Lens screenshot fixture id=${item.id} title="${title}"`);
  return item.id;
}

async function deleteLensContextItem(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/context/${id}`, { method: "DELETE" });
}

test.beforeAll(async () => {
  await ensureAppRunning();
});

test.describe("IIVO Lens screenshot", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("iivo_onboarding_v1_completed", "true");
    });
  });

  test("Context Library shows screenshot Lens metadata and thumbnail", async ({ page }) => {
    test.setTimeout(60_000);
    const title = `Lens screenshot QA ${Date.now()}`;
    const id = await createLensScreenshotItem(title);

    try {
      await page.goto("/");
      await page.getByTestId("sidebar-nav-context-library").click();
      await expect(page.getByTestId("context-library-panel")).toBeVisible();

      await page
        .getByTestId("context-library-list")
        .getByTestId("context-library-item-title")
        .filter({ hasText: title })
        .first()
        .click();

      await expect(page.getByTestId("context-lens-badge-detail")).toContainText(
        "Captured by IIVO Lens",
      );
      await expect(page.getByTestId("context-lens-capture-type")).toContainText(
        "Capture type: Screenshot",
      );
      await expect(page.getByTestId("context-screenshot-preview")).toBeVisible();
      await expect(page.getByTestId("context-screenshot-size")).toBeVisible();
    } finally {
      await deleteLensContextItem(id);
      await pause(page, 200);
    }
  });

  test("lensAsk for screenshot fills Analyze this screenshot prompt", async ({ page }) => {
    test.setTimeout(60_000);
    const title = `Lens screenshot ask QA ${Date.now()}`;
    const id = await createLensScreenshotItem(title);
    const url = `/?lensAsk=${encodeURIComponent(id)}`;
    const sourceUrl = "https://example.com/lens-screenshot-qa";

    const visionConfig = await fetchVisionConfig();
    const visionEnabled = isVisionEnabled(visionConfig);
    qaLog(
      `Vision config: enabled=${visionConfig.enabled} configured=${visionConfig.configured} → mode=${visionEnabled ? "enabled" : "disabled"}`,
    );

    try {
      await page.goto(url);
      await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });

      const chips = page.getByTestId("context-attachment-chip");
      await expect(chips.filter({ hasText: title }).first()).toBeVisible({ timeout: 20_000 });

      const composer = page.getByTestId("composer-input");
      await expect
        .poll(async () => composer.inputValue(), { timeout: 20_000 })
        .toMatch(/analyze this screenshot/i);

      const value = await composer.inputValue();
      const preview = value.replace(/\s+/g, " ").trim().slice(0, 220);
      qaLog(`Composer preview (${preview.length} chars shown): ${preview}`);
      qaLog(`Expected vision note mode: ${visionEnabled ? "enabled" : "disabled"}`);

      expect(value).toMatch(/analyze this screenshot/i);
      expect(value.toLowerCase()).toMatch(
        new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      );

      if (visionEnabled) {
        expect(value).toMatch(/vision analysis is available/i);
      } else {
        expect(value).toMatch(
          /image analysis is not configured|visual analysis is not configured/i,
        );
      }

      expect(value.toLowerCase()).toContain(sourceUrl.toLowerCase());
    } finally {
      await deleteLensContextItem(id);
    }
  });
});
