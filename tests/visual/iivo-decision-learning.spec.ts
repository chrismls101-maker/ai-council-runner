/**
 * IIVO Visual QA — Decision Learning System
 *
 * Headed Playwright test proving the full learning loop (UI + API persistence).
 * Requires: npm run dev (client :5173 + server :3001)
 */

import { test, expect, type Page } from "@playwright/test";
import {
  assertPriorOutcomeReferencedInAnswer,
  assertSavedOutcomeFields,
  fetchDecisionRecordByRunId,
  findLatestRunByPromptSnippet,
  waitForRunStatus,
} from "./decisionLearningApi.js";
import { isStepMode, pauseMs, qaLog, stepBoundary } from "./qaEnv.js";
import {
  completeQaStep,
  failQaStep,
  initQaMonitor,
  markQaCheck,
  qaAnnounceNext,
  qaClick,
  qaFill,
  showQaSuccess,
  updateQaMonitor,
} from "./qaMonitor.js";
import { RunWaitTimeoutError, waitForRunComplete } from "./runWaitHelpers.js";

const APP_URL = "http://localhost:5173";
const API_HEALTH_URL = "http://localhost:3001/api/health";

const PROMPT_A =
  "Should I add SMS follow-up to AI Front Desk now or wait until after 5 pilot customers?";

const PROMPT_D =
  "Should I keep focusing on missed-call recovery or add SMS now?";

const SUCCESS_SUMMARY = [
  "Product Decision completed",
  "Track Execution saved",
  "Decision Record verified",
  "Decision Learning dashboard opened",
  "Follow-up referenced saved outcome cautiously",
];

async function pause(page: Page, ms = 500): Promise<void> {
  await page.waitForTimeout(pauseMs(ms));
}

async function ensureAppRunning(): Promise<void> {
  try {
    const res = await fetch(APP_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error("bad status");
  } catch {
    throw new Error("Start IIVO first with npm run dev.");
  }
}

async function selectPillOption(
  page: Page,
  triggerTestId: string,
  optionLabel: string,
  nextLabel?: string,
): Promise<void> {
  const trigger = page.getByTestId(triggerTestId);
  await qaClick(page, trigger, nextLabel);
  await pause(page, 300);
  await qaClick(page, page.getByRole("option", { name: new RegExp(optionLabel, "i") }));
  await pause(page, 500);
}

async function openTrackExecution(page: Page): Promise<void> {
  const trigger = page.getByTestId("track-execution");
  const expanded = await trigger.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await qaClick(page, trigger, "Open Track Execution panel");
    await pause(page, 400);
  }
}

function activeTurn(page: Page) {
  return page.locator(".conversation-turn-active");
}

async function runStep<T>(
  page: Page,
  stepLabel: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    let actual: string | undefined;
    if (err instanceof RunWaitTimeoutError) {
      const d = err.diagnostics;
      actual = [
        `phase=${d.phase}`,
        `stopButtonVisible=${d.stopButtonVisible}`,
        `runStatus=${d.runStatusAttr ?? "none"}`,
        `finalAnswerExists=${d.finalAnswerExists}`,
        `finalAnswerLength=${d.finalAnswerLength}`,
        d.finalAnswerPreview ? `preview=${d.finalAnswerPreview.slice(0, 200)}` : "",
        `route=${d.routeText.slice(0, 100)}`,
      ]
        .filter(Boolean)
        .join("; ");
    }
    await failQaStep(page, stepLabel, {
      message,
      actual,
      suggestion:
        "Live QA can take 5–10 minutes. Check API keys and server logs. Avoid Stop during backend runs. Re-run with npm run qa:visual:record to capture trace/video.",
    });
    throw err;
  }
}

async function resetLocalCreditsForQa(): Promise<void> {
  try {
    const res = await fetch("http://localhost:3001/api/usage/reset-local", {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn("Could not reset local credits before visual QA — tests may fail if balance is low.");
    }
  } catch {
    console.warn("Could not reach usage API to reset credits — ensure server is running on :3001.");
  }
}

test.beforeAll(async () => {
  console.warn("\n⚠️  This visual QA test may use live API calls.\n");
  if (isStepMode()) {
    qaLog("Step mode enabled — long pauses between major steps.");
  }
  await ensureAppRunning();
  try {
    const health = await fetch(API_HEALTH_URL, { signal: AbortSignal.timeout(5000) });
    if (!health.ok) {
      console.warn("Backend health check failed — tests may not complete.");
    }
  } catch {
    console.warn("Backend not reachable at :3001 — start npm run dev.");
  }
  await resetLocalCreditsForQa();
});

test("Decision Learning visual QA flow", async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);

  let stepARunId: string | undefined;

  await page.goto("/");
  await initQaMonitor(page);
  await updateQaMonitor(page, {
    step: "Step A: Product Decision Run",
    status: "Opening IIVO",
    checks: [
      { label: "Prompt submitted", state: "pending" },
      { label: "Route detected: Product Decision", state: "pending" },
      { label: "Final answer complete", state: "pending" },
      { label: "Track Execution visible", state: "pending" },
    ],
  });
  await pause(page);

  await runStep(page, "Step A", async () => {
    await test.step("A — Product Decision creates Decision Record", async () => {
      qaLog("Step A started");
      await updateQaMonitor(page, { status: "Opening IIVO" });
      await pause(page);
      await stepBoundary("Step A — compose Product Decision prompt");

      await updateQaMonitor(page, { status: "Setting Auto Router and Quick mode" });
      await qaAnnounceNext(page, "Select Auto Router workflow");
      await selectPillOption(page, "workflow-select", "Auto Router");
      await qaAnnounceNext(page, "Select Quick token mode");
      await selectPillOption(page, "token-mode-select", "Quick");

      await updateQaMonitor(page, { status: "Submitting Product Decision prompt" });
      const composer = page.getByTestId("composer-input");
      await qaFill(page, composer, PROMPT_A, "Type Product Decision prompt");
      await pause(page);
      await qaClick(page, composer, "Submit prompt");
      await composer.press("Enter");
      await markQaCheck(page, "Prompt submitted", "pass");
      await pause(page, 800);

      await waitForRunComplete(page, {
        status: "Waiting for IIVO council to finish…",
        warning:
          "Waiting for council agents to finish. Live API — typically 1–4 minutes.",
        waitingCheckLabel: "Final answer complete",
        logPrefix: "Step A",
      });
      await pause(page);

      await updateQaMonitor(page, { status: "Checking route = Product Decision" });
      await expect(page.getByTestId("router-status")).toContainText(/Product Decision/i, {
        timeout: 10_000,
      });
      await markQaCheck(page, "Route detected: Product Decision", "pass");
      qaLog("Product Decision route found");

      await updateQaMonitor(page, { status: "Checking final answer" });
      await expect(activeTurn(page).getByTestId("final-answer")).toBeVisible();
      const answerText = await activeTurn(page).getByTestId("final-answer").innerText();
      expect(answerText.length).toBeGreaterThan(80);

      const runSummary = await waitForRunStatus(
        (await findLatestRunByPromptSnippet(PROMPT_A)).runId,
        "complete",
      );
      stepARunId = runSummary.runId;
      qaLog(`Step A completed — runId=${stepARunId}, API status=complete`);

      await updateQaMonitor(page, { status: "Checking Track Execution" });
      await openTrackExecution(page);
      await expect(page.getByTestId("track-execution-panel")).toBeVisible();
      await markQaCheck(page, "Track Execution visible", "pass");
      await completeQaStep(page, "Step A: Product Decision Run");
    });
  });

  await runStep(page, "Step B", async () => {
    await test.step("B — Fill Track Execution and save", async () => {
      qaLog("Step B started");
      await updateQaMonitor(page, {
        step: "Step B: Track Execution",
        status: "Filling Track Execution",
        checks: [
          { label: "Outcome fields filled", state: "active" },
          { label: "Outcome saved", state: "pending" },
          { label: "Decision record verified via API", state: "pending" },
        ],
      });
      await stepBoundary("Step B — fill Track Execution");

      await openTrackExecution(page);
      const panel = page.getByTestId("track-execution-panel");

      await panel.getByLabel(/Action taken/i).fill(
        "Delayed SMS and focused on missed-call recovery.",
      );
      await pause(page);
      await panel
        .getByLabel(/Expected outcome/i)
        .fill("Get first 5 pilot customers faster by keeping the offer simple.");
      await pause(page);
      await panel.getByLabel(/Outcome status/i).selectOption("in_progress");
      await pause(page);
      await panel.getByLabel(/Actual outcome/i).fill("Still testing.");
      await pause(page);
      await panel.getByLabel(/Metric \/ result/i).fill("0 pilots yet.");
      await pause(page);
      await panel
        .getByLabel(/Lessons learned/i)
        .fill(
          "Need more outreach volume before deciding whether the offer needs SMS.",
        );
      await pause(page);
      await markQaCheck(page, "Outcome fields filled", "pass");

      await updateQaMonitor(page, { status: "Saving outcome" });
      await qaClick(page, page.getByTestId("track-execution-save"), "Save Track Execution");
      await pause(page, 800);

      await expect(page.getByText("Saved locally")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("learning-summary")).toBeVisible();
      await markQaCheck(page, "Outcome saved", "pass");
      qaLog("Step B saved outcome");

      await updateQaMonitor(page, { status: "Verifying decision record via API" });
      expect(stepARunId, "Step A runId required for API verification").toBeTruthy();
      const record = await fetchDecisionRecordByRunId(stepARunId!);
      assertSavedOutcomeFields(record);
      await markQaCheck(page, "Decision record verified via API", "pass");
      qaLog("Decision record verified via API — all Track Execution fields match");
      await completeQaStep(page, "Step B: Outcome persisted");
    });
  });

  await runStep(page, "Step C", async () => {
    await test.step("C — Decision Learning dashboard", async () => {
      qaLog("Step C started");
      await updateQaMonitor(page, {
        step: "Step C: Decision Learning",
        status: "Opening Decision Learning",
        checks: [
          { label: "Dashboard visible", state: "pending" },
          { label: "Stats visible", state: "pending" },
          { label: "Latest decision opened", state: "pending" },
        ],
      });
      await stepBoundary("Step C — open Decision Learning dashboard");

      await qaClick(
        page,
        page.getByTestId("sidebar-nav-decision-learning"),
        "Open Decision Learning sidebar",
      );
      await pause(page, 600);

      await expect(page.getByTestId("decision-learning-dashboard")).toBeVisible();
      await markQaCheck(page, "Dashboard visible", "pass");

      await updateQaMonitor(page, { status: "Checking dashboard stats" });
      await expect(page.getByRole("heading", { name: "Decision Learning" })).toBeVisible();
      await expect(page.getByText(/Total decisions/i)).toBeVisible();
      await markQaCheck(page, "Stats visible", "pass");
      qaLog("Step C dashboard opened");

      const firstCard = page.getByTestId("decision-learning-card").first();
      await expect(firstCard).toBeVisible({ timeout: 10_000 });
      await expect(firstCard.getByRole("button", { name: "Review" })).toBeVisible();

      await updateQaMonitor(page, { status: "Opening latest decision" });
      await qaClick(page, firstCard.getByTestId("decision-record-open"), "Open latest decision");
      await pause(page, 800);

      await expect(page.getByTestId("final-answer")).toBeVisible({ timeout: 15_000 });
      await openTrackExecution(page);
      await expect(page.getByTestId("track-execution-panel")).toBeVisible();
      await markQaCheck(page, "Latest decision opened", "pass");
      await completeQaStep(page, "Step C: Decision Learning dashboard");
    });
  });

  await runStep(page, "Step D", async () => {
    await test.step("D — Related follow-up references inconclusive prior outcome", async () => {
      qaLog("Step D started");
      await updateQaMonitor(page, {
        step: "Step D: Follow-up Decision",
        status: "Starting follow-up decision",
        checks: [
          { label: "Follow-up prompt submitted", state: "pending" },
          { label: "Follow-up answer complete", state: "pending" },
          { label: "Saved-outcome references (≥2)", state: "pending" },
          { label: "Caution language (≥1)", state: "pending" },
        ],
      });
      await stepBoundary("Step D — follow-up prompt");

      await qaClick(page, page.getByTestId("new-decision-btn"), "Start new decision");
      await pause(page, 600);

      await selectPillOption(page, "workflow-select", "Auto Router");
      await selectPillOption(page, "token-mode-select", "Quick");

      await updateQaMonitor(page, { status: "Submitting follow-up prompt" });
      const composer = page.getByTestId("composer-input");
      await qaFill(page, composer, PROMPT_D, "Type follow-up prompt");
      await pause(page);
      await qaClick(page, composer, "Submit follow-up");
      await composer.press("Enter");
      await markQaCheck(page, "Follow-up prompt submitted", "pass");
      qaLog("Step D: Follow-up prompt submitted");
      await pause(page, 800);

      qaLog("Step D: Waiting for follow-up council response");
      await waitForRunComplete(page, {
        status: "Waiting for council…",
        warning:
          "Waiting for follow-up answer to include saved outcome context. Live API — typically 1–4 minutes.",
        waitingCheckLabel: "Follow-up answer complete",
        runWaitTimeoutMs: 300_000,
        logPrefix: "Step D",
      });
      await pause(page);

      const answer = await activeTurn(page).getByTestId("final-answer").innerText();
      qaLog(`Step D: Final answer detected (length=${answer.length})`);
      qaLog("Step D follow-up completed");

      await updateQaMonitor(page, { status: "Checking saved-outcome references" });
      const { savedCount, cautionCount } = assertPriorOutcomeReferencedInAnswer(answer);
      await markQaCheck(page, "Saved-outcome references (≥2)", "pass");
      qaLog(`Step D saved-outcome signals found: ${savedCount}`);

      await updateQaMonitor(page, { status: "Checking caution language" });
      expect(cautionCount).toBeGreaterThanOrEqual(1);
      await markQaCheck(page, "Caution language (≥1)", "pass");
      qaLog(`Step D caution signals found: ${cautionCount}`);

      const stepDRun = await waitForRunStatus(
        (await findLatestRunByPromptSnippet(PROMPT_D)).runId,
        "complete",
      );
      qaLog(`Step D API run status=complete (runId=${stepDRun.runId})`);

      const priorRecord = await fetchDecisionRecordByRunId(stepARunId!);
      assertSavedOutcomeFields(priorRecord);
      qaLog("Prior decision record still intact after follow-up run");
      await completeQaStep(page, "Step D: Decision Learning loop verified");
    });
  });

  await showQaSuccess(page, SUCCESS_SUMMARY, {
    statusMessage: "Decision Learning loop verified",
  });
  qaLog("IIVO Visual QA Passed — showing success summary");
  await page.waitForTimeout(pauseMs(6500));
});
