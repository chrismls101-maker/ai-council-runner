/**
 * IIVO Visual QA — Lens hardening (no extension install required)
 *
 * Requires: npm run dev (client :5173 + server :3001)
 */

import { test, expect } from "@playwright/test";
import { ensureAppRunning, pause } from "./qaStepHelpers.js";
import { qaLog } from "./qaEnv.js";

const API_BASE = "http://localhost:3001";

async function createLensContextItem(
  title: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "url",
      title,
      sourceUrl: "https://example.com/lens-hardening",
      contentText: "Truncated lens page text for hardening QA.",
      tags: ["lens", "browser", "page-context"],
      capturedVia: "browser_lens",
      capturedAt: new Date().toISOString(),
      sourceConfidence: "imported_url",
      lensCaptureType: "page",
      ...extra,
    }),
  });
  if (!res.ok) throw new Error("Failed to create lens context fixture");
  const item = (await res.json()) as { id: string };
  qaLog(`Created Lens hardening fixture id=${item.id} title="${title}"`);
  return item.id;
}

async function deleteLensContextItem(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/context/${id}`, { method: "DELETE" });
}

test.beforeAll(async () => {
  await ensureAppRunning();
});

test.describe("IIVO Lens hardening", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("iivo_onboarding_v1_completed", "true");
    });
  });

  test("invalid lensContextId shows friendly error without crashing", async ({ page }) => {
    test.setTimeout(60_000);
    const url = "/?lensContextId=missing-lens-id-qa";
    qaLog(`Opening URL: ${url}`);

    await page.goto(url);
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });

    const banner = page.getByTestId("lens-handoff-error");
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText("could not be attached");
    await expect(banner).toContainText("deleted");

    await expect(page.getByTestId("context-attachment-bar")).toHaveCount(0);
    expect(page.url()).not.toContain("lensContextId=");
  });

  test("invalid lensAsk shows same friendly error without crashing", async ({ page }) => {
    test.setTimeout(60_000);
    const url = "/?lensAsk=missing-lens-id-qa";
    qaLog(`Opening URL: ${url}`);

    await page.goto(url);
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });

    const banner = page.getByTestId("lens-handoff-error");
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText("could not be attached");
    await expect(banner).toContainText("deleted");

    await expect(page.getByTestId("context-attachment-bar")).toHaveCount(0);
    expect(page.url()).not.toContain("lensAsk=");
  });

  test("Context Library shows Lens metadata including truncated yes", async ({ page }) => {
    test.setTimeout(60_000);
    const title = `Lens hardening truncated ${Date.now()}`;
    const id = await createLensContextItem(title, {
      truncated: true,
      originalTextLength: 18_500,
      sentTextLength: 12_000,
      lensCaptureType: "page",
    });

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
      await expect(page.getByTestId("context-lens-capture-type")).toContainText("Capture type: Page");
      await expect(page.getByTestId("context-lens-truncated")).toContainText("Truncated: yes");
      await expect(page.getByTestId("context-lens-captured-at")).toBeVisible();
    } finally {
      await deleteLensContextItem(id);
      await pause(page, 200);
    }
  });
});
