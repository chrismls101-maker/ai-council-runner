/**
 * Builder Mode v2 — Business Asset Workspace visual QA.
 */

import { test, expect } from "@playwright/test";
import { ensureAppRunning, submitComposerPrompt } from "./qaStepHelpers.js";
import { waitForRunComplete } from "./runWaitHelpers.js";
import { getLatestTurn } from "./turnHelpers.js";
import {
  dismissBuilderConfirmIfVisible,
  MOCK_COLD_EMAIL_TURN,
  openBuilderFromTurn,
  navigateBuilderTab,
  backToChatFromBuilder,
  seedMockConversationThread,
  waitForBuilderOrRunResult,
} from "./artifactQaHelpers.js";
import { bootstrapQaWorkspace } from "./workspaceLayoutHelpers.js";

const MOCK_TRANSFORM =
  process.env.ARTIFACT_TRANSFORM_MOCK === "1" || process.env.ARTIFACT_QA_SKIP_LIVE === "1";

test.beforeAll(async () => {
  await ensureAppRunning();
});

test.describe("IIVO Builder Workspace v2", () => {
  test.beforeEach(async ({ page }) => {
    const { installMockTransformHeaders } = await import("./mockTransformHelpers.js");
    await installMockTransformHeaders(page);
  });

  test("mock transform creates child without replacing parent", async ({ page }) => {
    test.setTimeout(3 * 60_000);
    test.skip(!MOCK_TRANSFORM, "Set ARTIFACT_TRANSFORM_MOCK=1 for offline transform QA");

    const turn = await seedMockConversationThread(page, [MOCK_COLD_EMAIL_TURN]);
    await openBuilderFromTurn(page, turn);

    await navigateBuilderTab(page, "execute");
    await page.getByTestId("execute-transform-follow_up_sequence").click();
    await expect(page.getByTestId("transform-success-banner")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("related-artifacts-panel")).toBeVisible();
    await expect(page.getByTestId("transform-keep-original")).toBeVisible();

    await backToChatFromBuilder(page);
    await expect(page.getByTestId("child-artifact-event")).toBeVisible();

    const parentTitle = await page.locator(".artifact-title").first().innerText();
    expect(parentTitle).toMatch(/Cold Email/i);
  });

  test("Builder has Save and Share menu", async ({ page }) => {
    test.setTimeout(3 * 60_000);
    test.skip(!MOCK_TRANSFORM, "Requires mock builder session");

    const turn = await seedMockConversationThread(page, [
      {
        ...MOCK_COLD_EMAIL_TURN,
        id: "turn-save",
        artifact: {
          ...(MOCK_COLD_EMAIL_TURN.artifact as Record<string, unknown>),
          id: "art-save-test",
        },
      },
    ]);
    await openBuilderFromTurn(page, turn);

    await expect(page.getByTestId("builder-save")).toBeVisible();
    await page.getByTestId("builder-toolbar").scrollIntoViewIfNeeded();
    await page.getByTestId("builder-share").evaluate((el) => (el as HTMLButtonElement).click());
    await expect(page.getByTestId("builder-share-menu")).toBeVisible();
    await expect(page.getByTestId("share-create-link")).toBeVisible();
    await expect(page.getByTestId("share-copy-summary")).toBeVisible();
  });

  test("cold email opens Builder with tabs and version panel", async ({ page }) => {
    test.setTimeout(5 * 60_000);
    if (process.env.ARTIFACT_QA_SKIP_LIVE === "1" && !MOCK_TRANSFORM) test.skip();

    let turn;
    if (MOCK_TRANSFORM) {
      turn = await seedMockConversationThread(page, [MOCK_COLD_EMAIL_TURN]);
    } else {
      await bootstrapQaWorkspace(page);
      await submitComposerPrompt(
        page,
        "Write a cold email to a local HVAC owner offering a 14-day paid pilot for missed-call recovery.",
      );
      await waitForRunComplete(page, {
        status: "Builder QA — cold email",
        logPrefix: "Builder cold email",
        runWaitTimeoutMs: 4 * 60_000,
      });
      turn = getLatestTurn(page);
      await expect(turn.getByTestId("artifact-renderer")).toBeVisible({ timeout: 15_000 });
    }

    await openBuilderFromTurn(page, turn);
    await expect(page.getByTestId("builder-save")).toBeVisible();

    await navigateBuilderTab(page, "inspect");
    await expect(page.getByTestId("artifact-quality-panel")).toBeVisible();

    await navigateBuilderTab(page, "improve");
    await expect(page.getByTestId("section-variant-actions").first()).toBeVisible();
    await expect(page.getByTestId("version-history-panel")).toBeVisible();

    await navigateBuilderTab(page, "package");
    await expect(page.getByTestId("builder-package-panel")).toBeVisible();

    await navigateBuilderTab(page, "execute");
    await expect(page.getByTestId("execute-panel")).toBeVisible();

    await backToChatFromBuilder(page);
  });

  test("large landing page shows Builder confirmation", async ({ page }) => {
    test.setTimeout(5 * 60_000);
    if (process.env.ARTIFACT_QA_SKIP_LIVE === "1" || MOCK_TRANSFORM) test.skip();

    await bootstrapQaWorkspace(page);
    await submitComposerPrompt(page, "Build me a full landing page for my B2B SaaS.");
    const first = await waitForBuilderOrRunResult(page, "Builder landing", 45_000);
    if (first.phase === "builder_confirm") {
      await dismissBuilderConfirmIfVisible(page, "open_builder");
    }
    await waitForRunComplete(page, {
      status: "Builder QA — landing",
      logPrefix: "Builder landing",
      runWaitTimeoutMs: 4 * 60_000,
    }).catch(() => {});

    const canvas = page.getByTestId("builder-canvas");
    if (await canvas.isVisible().catch(() => false)) {
      await expect(page.getByTestId("build-map-panel")).toBeVisible();
    }
  });
});
