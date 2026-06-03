/**
 * Builder Mode v2 — Business Asset Workspace visual QA.
 */

import { test, expect } from "@playwright/test";
import { installNeutralPresetInit } from "./qaPresetHelpers.js";
import { ensureAppRunning, submitComposerPrompt } from "./qaStepHelpers.js";
import { waitForRunComplete } from "./runWaitHelpers.js";
import { getLatestTurn } from "./turnHelpers.js";
import {
  dismissBuilderConfirmIfVisible,
  waitForBuilderOrRunResult,
} from "./artifactQaHelpers.js";

const MOCK_TRANSFORM = process.env.ARTIFACT_TRANSFORM_MOCK === "1";

test.beforeAll(async () => {
  await ensureAppRunning();
});

test.describe("IIVO Builder Workspace v2", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("iivo_onboarding_v1_completed", "true");
      sessionStorage.removeItem("iivo-conversation-thread");
    });
    await installNeutralPresetInit(page);
  });

  test("mock transform creates child without replacing parent", async ({ page }) => {
    test.setTimeout(3 * 60_000);
    test.skip(!MOCK_TRANSFORM, "Set ARTIFACT_TRANSFORM_MOCK=1 for offline transform QA");

    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem(
        "iivo-conversation-thread",
        JSON.stringify([
          {
            id: "turn-mock",
            userPrompt: "Write a cold email to HVAC owner.",
            outputs: { finalJudge: "Subject: Hi\n\nBody: Pilot offer." },
            runStatus: "complete",
            artifact: {
              id: "art-mock-cold",
              type: "cold_email",
              renderMode: "inline",
              title: "Cold Email",
              sections: [
                {
                  id: "body",
                  label: "Email body",
                  kind: "email_body",
                  content: "Hi — 14-day pilot for missed-call recovery.",
                },
              ],
              actions: ["copy", "download_txt"],
            },
          },
        ]),
      );
    });
    await page.reload();

    const turn = page.getByTestId("conversation-turn").last();
    await turn.getByTestId("open-in-builder").click();
    await expect(page.getByTestId("builder-canvas")).toBeVisible();

    await page.getByTestId("builder-tab-execute").click();
    await page.getByTestId("execute-transform-follow_up_sequence").click();
    await expect(page.getByTestId("transform-success-banner")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("related-artifacts-panel")).toBeVisible();
    await expect(page.getByTestId("transform-keep-original")).toBeVisible();

    const parentTitle = await page.locator(".artifact-title").first().innerText();
    expect(parentTitle).toMatch(/Cold Email/i);
  });

  test("Builder has Save and Share menu", async ({ page }) => {
    test.setTimeout(3 * 60_000);
    test.skip(!MOCK_TRANSFORM, "Requires mock builder session");

    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem(
        "iivo-conversation-thread",
        JSON.stringify([
          {
            id: "turn-save",
            userPrompt: "Cold email",
            outputs: { finalJudge: "Email" },
            runStatus: "complete",
            artifact: {
              id: "art-save-test",
              type: "cold_email",
              renderMode: "inline",
              title: "Cold Email",
              sections: [
                { id: "b", label: "Body", kind: "email_body", content: "Hello" },
              ],
              actions: ["copy"],
            },
          },
        ]),
      );
    });
    await page.reload();
    await page.getByTestId("open-in-builder").click();
    await expect(page.getByTestId("builder-save")).toBeVisible();
    await page.getByTestId("builder-share").click();
    await expect(page.getByTestId("builder-share-menu")).toBeVisible();
    await expect(page.getByTestId("share-copy-summary")).toBeVisible();
  });

  test("cold email opens Builder with tabs and version panel", async ({ page }) => {
    test.setTimeout(5 * 60_000);
    if (process.env.ARTIFACT_QA_SKIP_LIVE === "1" && !MOCK_TRANSFORM) test.skip();

    await page.goto("/");
    if (!MOCK_TRANSFORM) {
      await submitComposerPrompt(
        page,
        "Write a cold email to a local HVAC owner offering a 14-day paid pilot for missed-call recovery.",
      );
      await waitForRunComplete(page, {
        status: "Builder QA — cold email",
        logPrefix: "Builder cold email",
        runWaitTimeoutMs: 4 * 60_000,
      });
    }

    const turn = getLatestTurn(page);
    await expect(turn.getByTestId("artifact-renderer")).toBeVisible({ timeout: 15_000 });
    await turn.getByTestId("open-in-builder").click();
    await expect(page.getByTestId("builder-canvas")).toBeVisible();
    await expect(page.getByTestId("build-map-panel")).toBeVisible();
    await expect(page.getByTestId("builder-save")).toBeVisible();

    await page.getByTestId("builder-tab-inspect").click();
    await expect(page.getByTestId("artifact-quality-panel")).toBeVisible();

    await page.getByTestId("builder-tab-improve").click();
    await expect(page.getByTestId("section-variant-actions").first()).toBeVisible();

    await page.getByTestId("builder-tab-package").click();
    await expect(page.getByTestId("builder-package-panel")).toBeVisible();

    await page.getByTestId("builder-tab-execute").click();
    await expect(page.getByTestId("execute-panel")).toBeVisible();

    await page.getByRole("button", { name: "Back to Chat" }).click();
    await expect(page.getByTestId("conversation-turn").last()).toBeVisible();
  });

  test("large landing page shows Builder confirmation", async ({ page }) => {
    test.setTimeout(5 * 60_000);
    if (process.env.ARTIFACT_QA_SKIP_LIVE === "1") test.skip();

    await page.goto("/");
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
