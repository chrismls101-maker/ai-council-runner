/**
 * Artifact Builder v1 — UI rendering (requires npm run dev).
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

test.beforeAll(async () => {
  await ensureAppRunning();
});

test.describe("IIVO Artifact Builder", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("iivo_onboarding_v1_completed", "true");
      sessionStorage.removeItem("iivo-conversation-thread");
    });
    await installNeutralPresetInit(page);
  });

  test("cold email artifact renders subject/body/copy", async ({ page }) => {
    test.setTimeout(5 * 60_000);
    await page.goto("/");
    await submitComposerPrompt(
      page,
      "Write a cold email to a local HVAC owner offering a 14-day paid pilot for missed-call recovery.",
    );
    if (process.env.ARTIFACT_QA_SKIP_LIVE === "1") {
      test.skip();
    }
    await waitForRunComplete(page, {
      status: "Artifact QA — cold email",
      logPrefix: "Artifact cold email",
      runWaitTimeoutMs: 4 * 60_000,
    });
    const turn = getLatestTurn(page);
    const finalAnswer = turn.getByTestId("final-answer");
    await expect(finalAnswer).toBeVisible();

    const artifact = turn.getByTestId("artifact-renderer");
    await expect(artifact).toBeVisible({ timeout: 10_000 });
    await expect(artifact).toHaveAttribute("data-artifact-type", /cold_email|email_template/);

    await expect(turn.getByTestId("artifact-email-body")).toBeVisible();
    await expect(turn.getByTestId("artifact-copy-body")).toBeVisible();

    const copySubject = turn.getByTestId("artifact-copy-subject");
    if ((await copySubject.count()) > 0) {
      await expect(copySubject).toBeVisible();
    }

    const text = await finalAnswer.innerText();
    expect(text).not.toMatch(/##\s*\*\*/);
  });

  test("builder confirmation for large landing page build", async ({ page }) => {
    test.setTimeout(5 * 60_000);
    await page.goto("/");
    await submitComposerPrompt(page, "Build me a full landing page for my B2B SaaS.");
    if (process.env.ARTIFACT_QA_SKIP_LIVE === "1") {
      test.skip();
    }

    const first = await waitForBuilderOrRunResult(page, "Artifact canvas", 45_000);

    if (first.phase === "builder_confirm") {
      await expect(page.getByRole("heading", { name: /Open Builder Mode/i })).toBeVisible();
      await dismissBuilderConfirmIfVisible(page, "keep_in_chat");
    }

    await waitForRunComplete(page, {
      status: "Artifact QA — canvas",
      logPrefix: "Artifact canvas",
      runWaitTimeoutMs: 4 * 60_000,
    });

    if (await page.getByTestId("builder-mode-confirm").isVisible().catch(() => false)) {
      await dismissBuilderConfirmIfVisible(page, "keep_in_chat");
    }

    const turn = getLatestTurn(page);
    const artifactVisible = await turn
      .getByTestId("artifact-renderer")
      .isVisible()
      .catch(() => false);
    const canvasVisible = await page
      .getByTestId("builder-canvas")
      .isVisible()
      .catch(() => false);
    expect(artifactVisible || canvasVisible).toBe(true);
  });
});
