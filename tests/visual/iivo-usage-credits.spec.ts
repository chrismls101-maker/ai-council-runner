/**
 * IIVO Visual QA — Usage & Credit System v1
 *
 * Two headed Playwright tests:
 * 1. Usage live charge flow — Direct Answer + Product Decision (live API)
 * 2. Usage estimate and guard flow — Deep estimate + insufficient credit block (no providers)
 *
 * Requires: npm run dev (client :5173 + server :3001)
 */

import { test, expect } from "@playwright/test";
import { isStepMode, pauseMs, qaLog, stepBoundary } from "./qaEnv.js";
import {
  completeQaStep,
  initQaMonitor,
  markQaCheck,
  qaAnnounceNext,
  qaFill,
  showQaSuccess,
  updateQaMonitor,
} from "./qaMonitor.js";
import {
  API_BASE,
  ensureAppRunning,
  expectLatestTurnRoute,
  getLatestTurn,
  logLatestTurnDebug,
  parseCreditsBadge,
  pause,
  pauseQuick,
  runQaStep,
  selectPillOption,
} from "./qaStepHelpers.js";
import { waitForRunComplete } from "./runWaitHelpers.js";
import {
  assertUsageResetToDefault,
  estimateCredits,
  expectCredits,
  fetchUsageEvents,
  fetchUsageSummary,
  hasCreditDeductionForWorkflow,
  resetLocalCredits,
} from "./usageCreditsApi.js";
import { verifyInsufficientCreditsGuard } from "./usageCreditsGuardHelpers.js";

const PROMPT_DIRECT = "What is IIVO?";
const PROMPT_PRODUCT =
  "Should I add SMS follow-up to AI Front Desk now or after 5 pilot customers?";

const PRODUCT_DECISION_CREDITS = 5;
const DIRECT_ANSWER_CREDITS = 1;

const LIVE_SUCCESS_SUMMARY = [
  "Direct Answer charged 1 credit",
  "Product Decision charged 5 credits",
  "Usage events verified",
];

const GUARD_SUCCESS_SUMMARY = [
  "Deep estimate = 10 credits verified",
  "Insufficient credit block verified",
  "No provider run started",
  "Credits reset to 100",
];

test.beforeAll(async () => {
  if (isStepMode()) {
    qaLog("Step mode enabled — long pauses between major steps.");
  }
  await ensureAppRunning();
  try {
    const health = await fetch(`${API_BASE}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!health.ok) {
      console.warn("Backend health check failed — tests may not complete.");
    }
  } catch {
    throw new Error("Start IIVO first with npm run dev.");
  }
});

test.describe("Usage & Credits Visual QA", () => {
  test("Usage live charge flow", async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);
    console.warn("\n⚠️  Usage live charge test uses live API calls.\n");

    let creditsAfterDirect = 99;

    await runQaStep(
      page,
      "Setup",
      async () => {
        const summary = await assertUsageResetToDefault();
        qaLog(`Credits reset — currentCredits=${summary.currentCredits}`);

        await page.goto("/dashboard");
        await initQaMonitor(page, {
          title: "IIVO Usage QA",
          initialStep: "Live charge flow",
          initialStatus: "Resetting local credits to 100",
        });
        await updateQaMonitor(page, {
          step: "Live charge flow",
          status: "Credits reset — opening IIVO",
          checks: [
            { label: "Credits reset to 100", state: "pass" },
            { label: "Direct Answer deducts 1 credit", state: "pending" },
            { label: "Product Decision deducts 5 credits", state: "pending" },
            { label: "Usage events verified", state: "pending" },
          ],
        });
        await pause(page);
      },
      { failureHint: "live" },
    );

    await runQaStep(
      page,
      "Direct Answer",
      async () => {
        await updateQaMonitor(page, {
          step: "Direct Answer credit test",
          status: "Waiting for 1-credit run to complete",
          warning: "Live API call — Direct Answer typically finishes in under 1 minute.",
        });
        await stepBoundary("Direct Answer prompt");

        await qaAnnounceNext(page, "Select Auto Router workflow");
        await selectPillOption(page, "workflow-select", "Auto Router");
        await qaAnnounceNext(page, "Select Quick token mode");
        await selectPillOption(page, "token-mode-select", "Quick");

        const beforeUsage = await fetchUsageSummary();
        expectCredits(beforeUsage, 100);

        await qaFill(page, page.getByTestId("composer-input"), PROMPT_DIRECT, "Type Direct Answer prompt");
        await pause(page, 400);
        await page.getByTestId("composer-input").press("Enter");

        await waitForRunComplete(page, {
          status: "Waiting for Direct Answer to complete…",
          warning: "Live API — waiting for Direct Answer (typically under 1 minute).",
          waitingCheckLabel: "Direct Answer deducts 1 credit",
          logPrefix: "Direct Answer",
          runWaitTimeoutMs: 180_000,
        });

        await logLatestTurnDebug(page, "After Direct Answer");
        await expectLatestTurnRoute(page, /Direct Answer/i);
        const latestTurn = getLatestTurn(page);
        await expect(latestTurn.getByTestId("final-answer")).toBeVisible();
        await expect(latestTurn.getByTestId("run-status")).toHaveAttribute(
          "data-status",
          "complete",
        );

        const afterUsage = await fetchUsageSummary();
        creditsAfterDirect = beforeUsage.currentCredits - DIRECT_ANSWER_CREDITS;
        expectCredits(afterUsage, creditsAfterDirect);
        qaLog(`Direct Answer charged 1 credit — balance ${afterUsage.currentCredits}`);

        const badge = page.getByTestId("usage-indicator");
        await expect(badge).toBeVisible();
        expect(parseCreditsBadge(await badge.innerText())?.current).toBe(creditsAfterDirect);

        await markQaCheck(page, "Direct Answer deducts 1 credit", "pass");
        await completeQaStep(page, "Direct Answer credit test");
      },
      { failureHint: "live" },
    );

    await runQaStep(
      page,
      "Product Decision",
      async () => {
        await updateQaMonitor(page, {
          step: "Product Decision credit test",
          status: "Waiting for 5-credit council run",
          warning: "Live API call — council run typically 1–4 minutes.",
        });
        await stepBoundary("Product Decision prompt");

        const beforeUsage = await fetchUsageSummary();
        expectCredits(beforeUsage, creditsAfterDirect);

        qaLog("Selecting Product Decision workflow for deterministic credit test");
        qaLog("Product Decision credit test is not testing Auto Router");
        qaLog("Expected charge: 5 credits");

        await qaAnnounceNext(page, "Select Product Decision workflow");
        await selectPillOption(page, "workflow-select", "Product Decision");
        await selectPillOption(page, "token-mode-select", "Quick");

        await qaFill(
          page,
          page.getByTestId("composer-input"),
          PROMPT_PRODUCT,
          "Type Product Decision prompt",
        );
        await pause(page, 400);
        await page.getByTestId("composer-input").press("Enter");

        await waitForRunComplete(page, {
          status: "Waiting for Product Decision council to finish…",
          warning: "Live API — waiting for council agents (typically 1–4 minutes).",
          waitingCheckLabel: "Product Decision deducts 5 credits",
          logPrefix: "Product Decision",
        });

        await logLatestTurnDebug(page, "After Product Decision");
        await expectLatestTurnRoute(page, /Product Decision/i);
        const latestTurn = getLatestTurn(page);
        await expect(latestTurn.getByTestId("final-answer")).toBeVisible();
        expect((await latestTurn.getByTestId("final-answer").innerText()).length).toBeGreaterThan(80);
        await expect(latestTurn.getByTestId("run-status")).toHaveAttribute(
          "data-status",
          "complete",
        );

        const afterUsage = await fetchUsageSummary();
        expectCredits(afterUsage, beforeUsage.currentCredits - PRODUCT_DECISION_CREDITS);
        qaLog(`Product Decision charged 5 credits — balance ${afterUsage.currentCredits}`);

        const badge = page.getByTestId("usage-indicator");
        expect(parseCreditsBadge(await badge.innerText())?.current).toBe(afterUsage.currentCredits);

        await markQaCheck(page, "Product Decision deducts 5 credits", "pass");
        await completeQaStep(page, "Product Decision credit test");
      },
      { failureHint: "live" },
    );

    await runQaStep(
      page,
      "Usage events",
      async () => {
        const events = await fetchUsageEvents();
        expect(
          hasCreditDeductionForWorkflow(events, "direct_answer", DIRECT_ANSWER_CREDITS) ||
            events.some(
              (e) =>
                (e.eventType === "credits_deducted" || e.eventType === "credits_reserved") &&
                e.credits === DIRECT_ANSWER_CREDITS,
            ),
        ).toBe(true);
        expect(
          hasCreditDeductionForWorkflow(events, "product-decision", PRODUCT_DECISION_CREDITS),
        ).toBe(true);
        qaLog("Usage events verified — Direct Answer 1 credit, Product Decision 5 credits");

        await markQaCheck(page, "Usage events verified", "pass");
      },
      { failureHint: "live" },
    );

    await showQaSuccess(page, LIVE_SUCCESS_SUMMARY, {
      statusMessage: "Live charge flow verified",
    });
    await page.waitForTimeout(pauseMs(4000));
  });

  test("Usage estimate and guard flow", async ({ page }) => {
    test.setTimeout(3 * 60 * 1000);
    console.warn("\nℹ️  Usage estimate/guard test does not call live providers.\n");

    await runQaStep(
      page,
      "Setup",
      async () => {
        const summary = await assertUsageResetToDefault();
        qaLog(`Credits reset — currentCredits=${summary.currentCredits}`);

        await page.goto("/dashboard");
        await initQaMonitor(page, {
          title: "IIVO Usage QA",
          initialStep: "Estimate & guard flow",
          initialStatus: "Resetting local credits to 100",
        });
        await updateQaMonitor(page, {
          step: "Estimate & guard flow",
          status: "Credits reset — ready for estimate/guard checks",
          checks: [
            { label: "Deep estimate = 10 credits", state: "pending" },
            { label: "Insufficient credits block run", state: "pending" },
            { label: "Credits reset to 100", state: "pending" },
          ],
        });
        await pauseQuick(page, 300);
      },
      { failureHint: "estimate-guard" },
    );

    await runQaStep(
      page,
      "Deep estimate",
      async () => {
        await updateQaMonitor(page, {
          step: "Deep estimate test",
          status: "Checking estimate via API (no model call)",
        });

        const apiEstimate = await estimateCredits({
          workflowId: "product-decision",
          tokenMode: "deep",
        });
        expect(apiEstimate.estimatedCredits).toBe(10);
        expect(apiEstimate.workflowId).toBe("product-decision");
        qaLog("Deep estimate = 10 credits verified via API");

        await updateQaMonitor(page, { status: "Checking UI estimate if available" });
        await selectPillOption(page, "workflow-select", "Product Decision");
        await selectPillOption(page, "token-mode-select", "Deep");
        await pauseQuick(page, 500);

        const estimateHint = page.getByTestId("composer-credit-estimate");
        const hintVisible = await estimateHint.isVisible().catch(() => false);
        if (hintVisible) {
          await expect(estimateHint).toContainText(/10 credits/i);
          qaLog("UI composer estimate shows 10 credits");
        } else {
          qaLog("UI composer estimate not visible — API estimate is sufficient");
        }

        await selectPillOption(page, "token-mode-select", "Quick");
        await markQaCheck(page, "Deep estimate = 10 credits", "pass");
        await completeQaStep(page, "Deep estimate test");
      },
      { failureHint: "estimate-guard" },
    );

    await runQaStep(
      page,
      "Insufficient credits",
      async () => {
        await updateQaMonitor(page, {
          step: "Insufficient credit block",
          status: "Setting credits to 1 via local test API",
        });

        await page.reload();
        await pauseQuick(page, 500);
        await initQaMonitor(page, {
          title: "IIVO Usage QA",
          initialStep: "Insufficient credit block",
          initialStatus: "Verifying run is blocked before provider call",
        });

        await updateQaMonitor(page, {
          status: "Attempting Product Decision with 1 credit (should block)",
        });

        await verifyInsufficientCreditsGuard(page, { requireUiBanner: true });
        qaLog("Insufficient credit block verified — no provider run started");

        await markQaCheck(page, "Insufficient credits block run", "pass");
        await completeQaStep(page, "Insufficient credit block");
      },
      { failureHint: "estimate-guard" },
    );

    await runQaStep(
      page,
      "Reset credits",
      async () => {
        const summary = await resetLocalCredits();
        expectCredits(summary, 100);
        qaLog("Credits reset to 100");

        await page.reload();
        await pauseQuick(page, 400);
        const badge = page.getByTestId("usage-indicator");
        if (await badge.isVisible().catch(() => false)) {
          expect(parseCreditsBadge(await badge.innerText())?.current).toBe(100);
        }

        await markQaCheck(page, "Credits reset to 100", "pass");
      },
      { failureHint: "estimate-guard" },
    );

    await showQaSuccess(page, GUARD_SUCCESS_SUMMARY, {
      statusMessage: "Estimate & guard flow verified",
    });
    await page.waitForTimeout(pauseMs(3000));
  });
});
