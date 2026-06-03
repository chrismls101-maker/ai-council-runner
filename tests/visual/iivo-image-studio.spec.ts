/**
 * IIVO Image Studio visual QA
 */

import { test, expect } from "@playwright/test";
import { ensureAppRunning } from "./qaStepHelpers.js";
import {
  MOCK_COLD_EMAIL_TURN,
  navigateBuilderTab,
  openBuilderFromTurn,
  seedMockConversationThread,
} from "./artifactQaHelpers.js";

test.beforeAll(async () => {
  await ensureAppRunning();
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/images/**", (route) => route.continue());
  await page.setExtraHTTPHeaders({ "x-iivo-mock-images": "1" });
});

async function openImageStudio(page: import("@playwright/test").Page) {
  const turn = await seedMockConversationThread(page, [MOCK_COLD_EMAIL_TURN]);
  await openBuilderFromTurn(page, turn);
  await navigateBuilderTab(page, "visuals");
  await expect(page.getByTestId("image-studio-panel")).toBeVisible();
}

test.describe("IIVO Image Studio", () => {
  test("Image Studio opens from Builder and generates mock visual", async ({ page }) => {
    test.setTimeout(60_000);
    await openImageStudio(page);
    await expect(page.getByTestId("image-brief-editor")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("image-credit-estimate")).toBeVisible();
    await page.getByTestId("image-generate-button").click();
    await expect(page.getByTestId("image-result-grid")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("image-download-png")).toBeVisible();
    await expect(page.getByTestId("image-copy-prompt")).toBeVisible();
  });

  test("IP warning appears for risky brand-copy prompt", async ({ page }) => {
    test.setTimeout(60_000);
    await openImageStudio(page);
    await expect(page.getByTestId("image-brief-prompt")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("image-brief-prompt").fill(
      "Make this in the style of Apple with their official logo and Marvel characters",
    );
    await page.getByTestId("image-brief-prompt").blur();
    await page.waitForTimeout(500);
    await page.getByTestId("image-generate-button").click();
    await expect(page.getByTestId("image-ip-warning")).toBeVisible({ timeout: 15_000 });
  });

  test("attach to artifact works and session snapshot has no base64", async ({ page }) => {
    test.setTimeout(60_000);
    await openImageStudio(page);
    await expect(page.getByTestId("image-generate-button")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("image-generate-button").click();
    await expect(page.getByTestId("image-attach-to-artifact")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("image-attach-to-artifact").click();
    const thread = await page.evaluate(() => sessionStorage.getItem("iivo-conversation-thread") ?? "");
    assertNoBase64InSnapshot(thread);
  });

  test("Image pack workflow generates 2–4 mock images", async ({ page }) => {
    test.setTimeout(60_000);
    await openImageStudio(page);
    await page.getByTestId("image-studio-mode-pack").click();
    await expect(page.getByTestId("image-pack-builder")).toBeVisible();
    await page.getByTestId("image-pack-count").selectOption("3");
    await page.getByTestId("image-pack-generate-button").click();
    await expect(page.getByTestId("image-pack-result-grid")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("image-pack-result-card")).toHaveCount(3);
  });

  test("Proposal cover generates mock visual with quality panel", async ({ page }) => {
    test.setTimeout(60_000);
    await openImageStudio(page);
    await page.getByTestId("image-action-proposal-cover").click();
    await expect(page.getByTestId("image-brief-editor")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("image-generate-button").click();
    await expect(page.getByTestId("image-result-grid")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("image-quality-panel")).toBeVisible();
    await expect(page.getByTestId("image-download-png")).toBeVisible();
    await expect(page.getByTestId("image-attach-to-artifact")).toBeVisible();
  });

  test("PDF export with attached image does not crash", async ({ page }) => {
    test.setTimeout(60_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await openImageStudio(page);
    await page.getByTestId("image-generate-button").click();
    await expect(page.getByTestId("image-attach-to-artifact")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("image-attach-to-artifact").click();
    await navigateBuilderTab(page, "compose");
    const pdfButton = page.getByTestId("builder-download-pdf");
    if (await pdfButton.isVisible()) {
      await pdfButton.click();
      await page.waitForTimeout(1000);
    }
    expect(pageErrors).toEqual([]);
  });

  test("Visual QA section appears when mock vision enabled", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setExtraHTTPHeaders({
      "x-iivo-mock-images": "1",
      "x-iivo-mock-vision-qa": "1",
    });
    await openImageStudio(page);
    await page.locator('label:has-text("Optional visual QA") input').check();
    await page.getByTestId("image-generate-button").click();
    await expect(page.getByTestId("image-quality-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("image-visual-qa-section")).toBeVisible({ timeout: 15_000 });
  });
});

function assertNoBase64InSnapshot(raw: string): void {
  expect(raw.length).toBeGreaterThan(0);
  expect(raw.toLowerCase()).not.toMatch(/base64/);
  expect(raw).not.toMatch(/iVBORw0KGgo/);
}
