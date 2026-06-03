/**
 * IIVO Visual QA — Context Bridge v1 (Hardening)
 *
 * UI-only tests by default. Live provider tests are skipped unless CONTEXT_QA_LIVE=1.
 *
 * Requires: npm run dev (client :5173 + server :3001)
 */

import { test, expect, type Page } from "@playwright/test";
import {
  ensureAppRunning,
  getLatestTurn,
  logLatestTurnDebug,
  pause,
} from "./qaStepHelpers.js";
import { qaLog } from "./qaEnv.js";
import { waitForRunComplete } from "./runWaitHelpers.js";
import {
  expectContextLibraryItemAbsent,
  expectContextLibraryItemPresent,
  expectContextLibraryMemoryStatus,
  getContextLibraryDetail,
  logLatestTurnRoute,
  openLatestTurnDetailsForContextTrace,
  selectContextLibraryItemByTitle,
} from "./contextBridgeTestHelpers.js";

const SAMPLE_CONTEXT = {
  title: "IIVO founder notes",
  text: "IIVO is an AI decision engine for founders.",
};

const POSITIONING_CONTEXT = {
  title: "IIVO positioning notes",
  text: "IIVO positioning: AI decision engine for founders who need clarity, not more chat noise.",
};

async function attachPastedContext(page: Page, title: string, text: string) {
  await page.locator(".composer-plus-btn").click();
  await page.getByTestId("context-bridge-paste-context").click();
  await page.getByTestId("paste-context-title-input").fill(title);
  await page.getByTestId("paste-context-text-input").fill(text);
  await page.getByTestId("paste-context-add-btn").click();
}

async function logLiveContextTraceDiagnostics(page: Page, label: string): Promise<void> {
  const turnCount = await page.getByTestId("conversation-turn").count().catch(() => 0);
  qaLog(`${label}: latest turn exists=${turnCount > 0} (count=${turnCount})`);

  if (turnCount === 0 || page.isClosed()) {
    qaLog(`${label}: page closed=${page.isClosed()}`);
    return;
  }

  const latestTurn = getLatestTurn(page);
  const runStatus = await latestTurn
    .getByTestId("run-status")
    .getAttribute("data-status")
    .catch(() => null);
  qaLog(`${label}: run-status data-status=${runStatus ?? "none"}`);

  const finalAnswer = latestTurn.getByTestId("final-answer");
  const finalVisible = await finalAnswer.isVisible().catch(() => false);
  const finalLen = finalVisible
    ? (await finalAnswer.innerText().catch(() => "")).length
    : 0;
  qaLog(`${label}: final-answer visible=${finalVisible}, length=${finalLen}`);

  const costTraceCount = await latestTurn.getByTestId("cost-trace").count().catch(() => 0);
  const directDetailsCount = await latestTurn
    .getByTestId("direct-answer-details")
    .count()
    .catch(() => 0);
  qaLog(`${label}: cost-trace button exists=${costTraceCount > 0}`);
  qaLog(`${label}: direct-answer-details exists=${directDetailsCount > 0}`);
}

async function runLiveContextTraceTest(page: Page): Promise<void> {
  qaLog("Live context trace test started");

  await attachPastedContext(page, POSITIONING_CONTEXT.title, POSITIONING_CONTEXT.text);
  qaLog("Context attached");

  const chip = page.getByTestId("context-attachment-chip");
  await expect(chip).toContainText("User-pasted context");
  await expect(chip).toHaveAttribute("data-confidence", "user_pasted");

  await page
    .getByTestId("composer-input")
    .fill("How should IIVO position itself for founders?");
  qaLog("Prompt submitted");
  await page.getByTestId("composer-send").click();

  qaLog("Waiting for answer");
  try {
    await waitForRunComplete(page, {
      status: "Waiting for IIVO response with attached context…",
      logPrefix: "Test E",
      runWaitTimeoutMs: 5 * 60_000,
      waitingCheckLabel: "Run completes with context trace",
    });
  } catch (err) {
    await logLiveContextTraceDiagnostics(page, "Test E timeout");
    await logLatestTurnDebug(page, "Test E timeout");
    throw err;
  }

  qaLog("Latest turn completed");
  const latestTurn = getLatestTurn(page);
  await expect(latestTurn.getByTestId("final-answer")).toBeVisible();
  await logLatestTurnRoute(page);

  const trace = await openLatestTurnDetailsForContextTrace(page);
  qaLog("External context trace found");

  await expect(trace).toContainText(POSITIONING_CONTEXT.title);
  await expect(trace).toContainText("Relevance:");
  qaLog("Relevance label found");

  await expect(trace).toContainText("Source:");
  qaLog("Source confidence found");
}

test.beforeAll(async () => {
  await ensureAppRunning();
});

test.describe("Context Bridge v1", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("iivo_onboarding_v1_completed", "true");
    });
  });

  test("A — Paste Context UI", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/");
    await page.getByTestId("composer-input").click();
    await attachPastedContext(page, SAMPLE_CONTEXT.title, SAMPLE_CONTEXT.text);
    await expect(page.getByTestId("context-attachment-bar")).toBeVisible();
    await expect(page.getByTestId("context-attachment-chip")).toContainText(SAMPLE_CONTEXT.title);
    await expect(page.getByTestId("context-ephemeral-reminder")).toBeVisible();
    await page.getByTestId("context-chip-remove").click();
    await expect(page.getByTestId("context-attachment-bar")).not.toBeVisible();
  });

  test("B — Save Evidence", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await page.locator(".composer-plus-btn").click();
    await page.getByTestId("context-bridge-save-evidence").click();
    await page.getByTestId("paste-context-title-input").fill(`QA evidence ${Date.now()}`);
    await page.getByTestId("paste-context-text-input").fill(SAMPLE_CONTEXT.text);
    await page.getByTestId("paste-context-save-btn").click();
    await page.getByTestId("sidebar-nav-context-library").click();
    await expect(page.getByTestId("context-library-panel")).toBeVisible();
    const firstItem = page.locator(".context-library-item").first();
    await expect(firstItem).toBeVisible();
    await firstItem.click();
    await expect(page.getByTestId("context-library-confidence")).toBeVisible();
    await page.getByTestId("context-library-delete-btn").click();
    page.once("dialog", (dialog) => dialog.accept());
    await pause(page, 400);
  });

  test("C — Ask IIVO About This (live, optional)", async ({ page }) => {
    test.skip(!process.env.CONTEXT_QA_LIVE, "Set CONTEXT_QA_LIVE=1 to run live provider test");
    test.setTimeout(4 * 60_000);
    await page.goto("/");
    await attachPastedContext(page, "Founder context", SAMPLE_CONTEXT.text);
    await page.getByTestId("composer-input").fill("What is the key takeaway from this context?");
    await page.getByTestId("composer-send").click();
    await expect(page.locator(".assistant-body, .direct-answer-body").first()).toBeVisible({
      timeout: 120_000,
    });
  });

  test("D — Trust Copy", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/");
    await page.getByTestId("sidebar-nav-trust").click();
    const copy = page.getByTestId("context-bridge-trust-copy");
    await expect(copy).toBeVisible();
    await expect(copy).toContainText("Context Bridge");
    await expect(copy).toContainText("attach it to a prompt");
    await expect(copy).toContainText("Memory is separate");
    const text = (await copy.innerText()).toLowerCase();
    expect(text).not.toContain("watches your browser");
    expect(text).not.toContain("sees everything");
  });

  test("E — Context relevance / trace", async ({ page }) => {
    test.setTimeout(process.env.CONTEXT_QA_LIVE ? 5 * 60_000 : 60_000);
    await page.goto("/");

    if (!process.env.CONTEXT_QA_LIVE) {
      await attachPastedContext(
        page,
        POSITIONING_CONTEXT.title,
        POSITIONING_CONTEXT.text,
      );
      const chip = page.getByTestId("context-attachment-chip");
      await expect(chip).toContainText("User-pasted context");
      await expect(chip).toHaveAttribute("data-confidence", "user_pasted");
      return;
    }

    await runLiveContextTraceTest(page);
  });

  test("F — Large context truncation", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/");
    const largeText = "A".repeat(12_500);
    await attachPastedContext(page, "Large paste QA", largeText);
    await expect(page.getByTestId("context-truncation-warning")).toBeVisible();
    await expect(page.getByTestId("context-truncation-warning")).toContainText("truncated");
    const chip = page.getByTestId("context-attachment-chip");
    await expect(chip).toHaveAttribute("data-truncated", "true");
    await expect(chip).toContainText("May truncate for run");
  });

  test("G — Context contamination guard", async ({ page }) => {
    test.setTimeout(120_000);
    const ephemeralTitle = `Ephemeral QA ${Date.now()}`;
    const evidenceTitle = `Evidence QA ${Date.now()}`;

    await page.goto("/");
    await attachPastedContext(page, ephemeralTitle, SAMPLE_CONTEXT.text);
    await expect(page.getByTestId("context-ephemeral-reminder")).toBeVisible();
    await page.reload();
    await page.getByTestId("sidebar-nav-context-library").click();
    await expect(page.getByTestId("context-library-panel")).toBeVisible();
    await expectContextLibraryItemAbsent(page, ephemeralTitle);

    await page.goto("/");
    await page.locator(".composer-plus-btn").click();
    await page.getByTestId("context-bridge-save-evidence").click();
    await page.getByTestId("paste-context-title-input").fill(evidenceTitle);
    await page.getByTestId("paste-context-text-input").fill(SAMPLE_CONTEXT.text);
    await page.getByTestId("paste-context-save-btn").click();

    await page.getByTestId("sidebar-nav-context-library").click();
    await expectContextLibraryItemPresent(page, evidenceTitle);
    await expectContextLibraryMemoryStatus(page, evidenceTitle, /no/i);

    await page.getByTestId("sidebar-nav-memory").click();
    await expect(page.getByTestId("memory-vault-panel")).toBeVisible();
    await expect(page.getByTestId("memory-vault-panel").getByText(evidenceTitle)).not.toBeVisible();

    await page.getByTestId("sidebar-nav-context-library").click();
    await selectContextLibraryItemByTitle(page, evidenceTitle);
    page.once("dialog", (dialog) => dialog.accept());
    await getContextLibraryDetail(page).getByTestId("context-library-delete-btn").click();
    await pause(page, 400);
  });

  test("H — URL safety", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/");
    await page.locator(".composer-plus-btn").click();
    await page.getByTestId("context-bridge-import-url").click();
    await expect(page.getByTestId("import-url-modal")).toBeVisible();

    await page.getByTestId("import-url-input").fill("http://localhost:3001/api/health");
    await page.getByTestId("import-url-btn").click();
    await expect(page.getByTestId("import-url-error")).toBeVisible();
    await expect(page.getByTestId("import-url-error")).toContainText(/private|local|paste/i);

    await page.getByTestId("import-url-input").fill("file:///etc/passwd");
    await page.getByTestId("import-url-btn").click();
    await expect(page.getByTestId("import-url-error")).toContainText(/file:\/\/|paste/i);
  });
});
