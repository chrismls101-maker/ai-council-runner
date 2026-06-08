/**
 * IIVO Visual QA — Lens handoff (no extension install required)
 *
 * Requires: npm run dev (client :5173 + server :3001)
 */

import { test, expect } from "@playwright/test";
import { ensureAppRunning, pause } from "./qaStepHelpers.js";
import { qaLog } from "./qaEnv.js";

const API_BASE = "http://localhost:3001";

async function createLensContextItem(title: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "url",
      title,
      sourceUrl: "https://example.com/lens-qa",
      contentText: "IIVO Lens handoff test content for founders.",
      tags: ["lens", "browser", "page-context"],
      capturedVia: "browser_lens",
      capturedAt: new Date().toISOString(),
      sourceConfidence: "imported_url",
    }),
  });
  if (!res.ok) throw new Error("Failed to create lens context fixture");
  const item = (await res.json()) as { id: string };
  qaLog(`Created Lens context item id=${item.id} title="${title}"`);
  return item.id;
}

async function deleteLensContextItem(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/context/${id}`, { method: "DELETE" });
}

test.beforeAll(async () => {
  await ensureAppRunning();
});

test.describe("IIVO Lens handoff", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("iivo_onboarding_v1_completed", "true");
    });
  });

  test("lensContextId attaches context chip", async ({ page }) => {
    test.setTimeout(60_000);
    const title = `Lens handoff QA context ${Date.now()}`;
    const id = await createLensContextItem(title);
    const url = `/?lensContextId=${encodeURIComponent(id)}`;
    qaLog(`Opening URL: ${url}`);

    try {
      await page.goto(url);
      await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });
      qaLog(`After navigation URL: ${page.url()}`);

      const bar = page.getByTestId("context-attachment-bar");
      await expect(bar).toBeVisible({ timeout: 20_000 });

      const chips = page.getByTestId("context-attachment-chip");
      const chipCount = await chips.count();
      qaLog(`Context chips found: ${chipCount}`);
      expect(chipCount).toBeGreaterThan(0);

      await expect(chips.filter({ hasText: title }).first()).toBeVisible();
    } finally {
      await deleteLensContextItem(id);
    }
  });

  test("lensAsk attaches context and fills composer", async ({ page }) => {
    test.setTimeout(60_000);
    const title = `Lens handoff QA ask ${Date.now()}`;
    const id = await createLensContextItem(title);
    const url = `/?lensAsk=${encodeURIComponent(id)}`;
    qaLog(`Opening URL: ${url}`);

    try {
      await page.goto(url);
      await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });
      qaLog(`After navigation URL: ${page.url()}`);

      const chips = page.getByTestId("context-attachment-chip");
      await expect(chips.filter({ hasText: title }).first()).toBeVisible({ timeout: 20_000 });
      const chipCount = await chips.count();
      qaLog(`Context chips found: ${chipCount}`);

      const composer = page.getByTestId("composer-input");
      await expect(composer).toBeVisible();
      await expect
        .poll(async () => composer.inputValue(), { timeout: 20_000 })
        .toMatch(/analyze the context/i);
      const value = await composer.inputValue();
      qaLog(`Composer value length: ${value.length}`);
      expect(value.toLowerCase()).toContain("key takeaway");
      await expect(page.getByTestId("composer-send")).toBeEnabled();
    } finally {
      await deleteLensContextItem(id);
    }
  });

  test("Context Library shows Lens badge", async ({ page }) => {
    test.setTimeout(60_000);
    const title = `Lens badge QA ${Date.now()}`;
    const id = await createLensContextItem(title);

    try {
      await page.goto("/dashboard");
      await page.getByTestId("sidebar-nav-context-library").click();
      await expect(page.getByTestId("context-library-panel")).toBeVisible();
      await expect(
        page
          .getByTestId("context-library-list")
          .getByTestId("context-library-item-title")
          .filter({ hasText: title })
          .first(),
      ).toBeVisible();
      await page
        .getByTestId("context-library-list")
        .getByTestId("context-library-item-title")
        .filter({ hasText: title })
        .first()
        .click();
      await expect(page.getByTestId("context-lens-badge-detail")).toContainText(
        "Captured by IIVO Lens",
      );
    } finally {
      await deleteLensContextItem(id);
      await pause(page, 200);
    }
  });
});
