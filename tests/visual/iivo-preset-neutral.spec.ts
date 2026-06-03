/**
 * Preset neutral default + opt-in AI Front Desk — requires npm run dev
 */

import { test, expect } from "@playwright/test";
import {
  assertNeutralPresetActive,
  assertNoPresetBleed,
  installNeutralPresetInit,
  selectWorkspacePreset,
} from "./qaPresetHelpers.js";
import { ensureAppRunning, selectPillOption, submitComposerPrompt } from "./qaStepHelpers.js";
import { waitForRunComplete } from "./runWaitHelpers.js";
import { getLatestTurn } from "./turnHelpers.js";

test.beforeAll(async () => {
  await ensureAppRunning();
});

test.describe("Preset neutral default", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("iivo_onboarding_v1_completed", "true");
      sessionStorage.removeItem("iivo-conversation-thread");
    });
    await installNeutralPresetInit(page);
  });

  test("fresh load uses No preset with Auto Router", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });
    await assertNeutralPresetActive(page);
    await expect(page.getByTestId("workflow-select")).toContainText(/Auto/i);
    await expect(page.getByTestId("preset-neutral-note")).toContainText(/Neutral mode/i);
  });

  test("Direct Answer — Design.com screenshot has no AI Front Desk bleed", async ({ page }) => {
    test.setTimeout(5 * 60_000);
    await page.goto("/");
    await assertNeutralPresetActive(page);
    await submitComposerPrompt(page, "Analyze this screenshot of Design.com");
    if (process.env.PRESET_QA_SKIP_LIVE === "1") {
      test.skip();
    }
    await waitForRunComplete(page, {
      status: "Preset QA — Design.com",
      logPrefix: "Preset QA Design",
      runWaitTimeoutMs: 4 * 60_000,
    });
    const answer = await getLatestTurn(page).getByTestId("final-answer").innerText();
    await assertNoPresetBleed(page, answer, "Design.com screenshot");
  });

  test("explicit AI Front Desk preset injects sales context", async ({ page }) => {
    test.setTimeout(5 * 60_000);
    await page.goto("/");
    await selectWorkspacePreset(page, "AI Front Desk Sales Test");
    await expect(page.getByTestId("preset-select")).toContainText(/AI Front Desk/i);
    await selectPillOption(page, "workflow-select", "Auto");
    await submitComposerPrompt(page, "What is the first sales move?");
    if (process.env.PRESET_QA_SKIP_LIVE === "1") {
      test.skip();
    }
    await waitForRunComplete(page, {
      status: "Preset QA — Front Desk sales",
      logPrefix: "Preset QA Front Desk",
      runWaitTimeoutMs: 4 * 60_000,
    });
    const answer = await getLatestTurn(page).getByTestId("final-answer").innerText();
    expect(answer.length).toBeGreaterThan(20);
    const hasFrontDeskSignal =
      /front desk|receptionist|missed.?call|pilot|prospect|outreach|script/i.test(answer);
    expect(hasFrontDeskSignal).toBe(true);
  });
});
