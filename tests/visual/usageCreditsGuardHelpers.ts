/**
 * Insufficient-credit guard verification — shared by Master QA and Usage QA.
 *
 * Proves blocking before provider execution via API preflight (402 + event) and UI
 * (credit warning banner and/or client-side block without run-council).
 * Does not assume the send button is disabled.
 */

import { expect, type Page } from "@playwright/test";
import { qaLog } from "./qaEnv.js";
import {
  API_BASE,
  countConversationTurns,
  parseCreditsBadge,
  pauseQuick,
  selectPillOption,
} from "./qaStepHelpers.js";
import {
  expectCredits,
  fetchHistoryRunCount,
  fetchUsageEvents,
  fetchUsageSummary,
  hasEventType,
  setLocalCredits,
} from "./usageCreditsApi.js";

export const INSUFFICIENT_GUARD_PROMPT =
  "Should I add SMS follow-up to AI Front Desk now or after 5 pilot customers?";

export const PRODUCT_DECISION_QUICK_CREDITS = 5;

export interface InsufficientCreditsGuardOptions {
  /**
   * When true, fail if the credit-warning banner is not visible (dedicated `qa:usage:guard`).
   * Default false — API 402 + blocked event is sufficient (Master QA).
   */
  requireUiBanner?: boolean;
}

export interface InsufficientCreditsGuardDiagnostics {
  startingCredits: number;
  creditsSetForTest: number;
  attemptedWorkflow: string;
  expectedCredits: number;
  /** Whether `.banner.credit-warning` was visible after UI submit attempt. */
  uiWarningVisible: boolean;
  /** @deprecated Use uiWarningVisible — kept for JSON report compatibility */
  errorMessageVisible: boolean;
  uiWarningNote?: string;
  apiGuardConfirmed: boolean;
  blockedEventFound: boolean;
  serverPreflight402: boolean;
  finalCredits: number;
  turnsBefore: number;
  turnsAfter: number;
  historyRunsBefore: number;
  historyRunsAfter: number;
  runCouncilRequestSeen: boolean;
  runCouncilStatus?: number;
  estimateRequestSeen: boolean;
  confirmModalSeen: boolean;
  workflowSelected?: string;
  tokenModeSelected?: string;
  composerValueLength: number;
  sendClicked: boolean;
  blockPath: "client_preflight" | "server_402" | "api_preflight_only" | "none";
  requireUiBanner: boolean;
}

async function waitForUsageBadgeCredits(
  page: Page,
  expected: number,
  timeoutMs = 20_000,
): Promise<void> {
  const badge = page.getByTestId("usage-indicator");
  await expect(badge).toBeVisible({ timeout: timeoutMs });
  await expect
    .poll(async () => parseCreditsBadge(await badge.innerText())?.current, {
      timeout: timeoutMs,
    })
    .toBe(expected);
  qaLog(`[Usage guard] Usage badge shows ${expected} credits`);
}

async function readPillLabel(page: Page, triggerTestId: string): Promise<string> {
  const trigger = page.getByTestId(triggerTestId);
  await expect(trigger).toBeVisible();
  const label = trigger.locator(".pill-select-label");
  return (await label.innerText()).trim();
}

/** Deterministic server guard — POST run-council with 1 credit, expect 402 + event. */
async function verifyApiInsufficientCreditsBlock(): Promise<{
  serverPreflight402: boolean;
  blockedEventFound: boolean;
}> {
  await setLocalCredits(1);
  expectCredits(await fetchUsageSummary(), 1);

  const blockRes = await fetch(`${API_BASE}/api/run-council`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: INSUFFICIENT_GUARD_PROMPT,
      workflow: "product-decision",
      tokenMode: "small",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const serverPreflight402 = blockRes.status === 402;
  qaLog(`[Usage guard] API preflight POST /api/run-council → ${blockRes.status}`);

  expectCredits(await fetchUsageSummary(), 1);

  const events = await fetchUsageEvents();
  const blockedEventFound = hasEventType(events, "run_blocked_insufficient_credits");
  qaLog(`[Usage guard] run_blocked_insufficient_credits event=${blockedEventFound}`);

  if (!serverPreflight402) {
    throw new Error("Insufficient credits: server preflight did not return 402.");
  }
  if (!blockedEventFound) {
    throw new Error(
      "Insufficient credits: usage events missing run_blocked_insufficient_credits after API preflight.",
    );
  }

  return { serverPreflight402, blockedEventFound };
}

export async function verifyInsufficientCreditsGuard(
  page: Page,
  options: InsufficientCreditsGuardOptions = {},
): Promise<InsufficientCreditsGuardDiagnostics> {
  const requireUiBanner = options.requireUiBanner ?? false;
  qaLog(`[Usage guard] requireUiBanner=${requireUiBanner}`);

  const startingCredits = (await fetchUsageSummary()).currentCredits;
  const creditsSetForTest = 1;

  const apiProof = await verifyApiInsufficientCreditsBlock();

  let runCouncilRequestSeen = false;
  let runCouncilStatus: number | undefined;
  let estimateRequestSeen = false;

  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/api/run-council") && req.method() === "POST" && !url.includes("/stop")) {
      runCouncilRequestSeen = true;
      qaLog(`[Usage guard] Saw POST /api/run-council`);
    }
    if (url.includes("/api/usage/estimate") && req.method() === "POST") {
      estimateRequestSeen = true;
      qaLog(`[Usage guard] Saw POST /api/usage/estimate`);
    }
  });

  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/api/run-council") && res.request().method() === "POST" && !url.includes("/stop")) {
      runCouncilStatus = res.status();
      qaLog(`[Usage guard] /api/run-council response status=${res.status()}`);
    }
  });

  await page.reload();
  await pauseQuick(page, 600);
  await waitForUsageBadgeCredits(page, creditsSetForTest);

  const historyRunsBefore = await fetchHistoryRunCount();
  const turnsBefore = await countConversationTurns(page);

  await expect(page.getByTestId("workflow-select")).toBeVisible();
  await expect(page.getByTestId("token-mode-select")).toBeVisible();

  await selectPillOption(page, "workflow-select", "Product Decision");
  await selectPillOption(page, "token-mode-select", "Quick");

  const workflowSelected = await readPillLabel(page, "workflow-select");
  const tokenModeSelected = await readPillLabel(page, "token-mode-select");
  expect(workflowSelected).toMatch(/product decision/i);
  expect(tokenModeSelected).toMatch(/quick/i);

  const composer = page.getByTestId("composer-input");
  await expect(composer).toBeVisible();
  await composer.fill(INSUFFICIENT_GUARD_PROMPT);
  const composerValueLength = (await composer.inputValue()).length;
  expect(composerValueLength).toBeGreaterThan(10);

  const sendBtn = page.getByTestId("composer-send");
  await expect(sendBtn).toBeVisible();
  await expect(sendBtn).toBeEnabled();
  qaLog(
    `[Usage guard] workflow="${workflowSelected}" tokenMode="${tokenModeSelected}" composerLen=${composerValueLength} sendEnabled=true`,
  );

  let sendClicked = false;
  let confirmModalSeen = false;

  await sendBtn.click();
  sendClicked = true;
  qaLog("[Usage guard] Clicked composer-send");

  await pauseQuick(page, 800);

  const confirmModal = page.locator(".credit-confirm-modal");
  if (await confirmModal.isVisible().catch(() => false)) {
    confirmModalSeen = true;
    qaLog("[Usage guard] Credit confirm modal visible — clicking Continue");
    await page.getByRole("button", { name: "Continue" }).click();
    await pauseQuick(page, 2000);
  }

  const creditWarning = page.locator(".banner.credit-warning");
  let uiWarningVisible = false;
  try {
    await expect(creditWarning).toBeVisible({ timeout: 12_000 });
    await expect(creditWarning).toContainText(/Not enough credits/i);
    uiWarningVisible = true;
    qaLog("[Usage guard] UI credit-warning banner visible");
  } catch {
    uiWarningVisible = await creditWarning.isVisible().catch(() => false);
    if (!uiWarningVisible) {
      qaLog("[Usage guard] UI credit-warning banner not observed after submit");
    }
  }

  await pauseQuick(page, 500);

  const turnsAfter = await countConversationTurns(page);
  const historyRunsAfter = await fetchHistoryRunCount();
  const finalSummary = await fetchUsageSummary();
  const finalCredits = finalSummary.currentCredits;

  const apiGuardConfirmed =
    apiProof.serverPreflight402 && apiProof.blockedEventFound && finalCredits === creditsSetForTest;

  let blockPath: InsufficientCreditsGuardDiagnostics["blockPath"] = "none";
  if (uiWarningVisible && !runCouncilRequestSeen) {
    blockPath = "client_preflight";
  } else if (runCouncilRequestSeen && runCouncilStatus === 402) {
    blockPath = "server_402";
  } else if (apiGuardConfirmed) {
    blockPath = "api_preflight_only";
  }

  let uiWarningNote: string | undefined;
  if (!uiWarningVisible && apiGuardConfirmed && !requireUiBanner) {
    uiWarningNote = "UI banner not observed in Master QA; API guard confirmed.";
  }

  const diagnostics: InsufficientCreditsGuardDiagnostics = {
    startingCredits,
    creditsSetForTest,
    attemptedWorkflow: "product-decision / quick (5 credits)",
    expectedCredits: PRODUCT_DECISION_QUICK_CREDITS,
    uiWarningVisible,
    errorMessageVisible: uiWarningVisible,
    uiWarningNote,
    apiGuardConfirmed,
    blockedEventFound: apiProof.blockedEventFound,
    serverPreflight402: apiProof.serverPreflight402,
    finalCredits,
    turnsBefore,
    turnsAfter,
    historyRunsBefore,
    historyRunsAfter,
    runCouncilRequestSeen,
    runCouncilStatus,
    estimateRequestSeen,
    confirmModalSeen,
    workflowSelected,
    tokenModeSelected,
    composerValueLength,
    sendClicked,
    blockPath,
    requireUiBanner,
  };

  qaLog(`[Usage guard] diagnostics: ${JSON.stringify(diagnostics)}`);

  if (!sendClicked) {
    throw new Error(
      "Insufficient-credit test did not submit the run; check workflow/composer/send flow.",
    );
  }

  if (!estimateRequestSeen && !runCouncilRequestSeen) {
    throw new Error(
      "Insufficient-credit test did not submit the run; no /api/usage/estimate or /api/run-council request seen. Check workflow/composer/send flow.",
    );
  }

  const uiBlocked =
    uiWarningVisible || (runCouncilRequestSeen && runCouncilStatus === 402);

  if (!apiGuardConfirmed) {
    throw new Error(
      `Insufficient credits: API guard not proven (402=${apiProof.serverPreflight402}, blockedEvent=${apiProof.blockedEventFound}, finalCredits=${finalCredits}). ${formatGuardDiagnostics(diagnostics)}`,
    );
  }

  if (requireUiBanner && !uiBlocked) {
    throw new Error(
      `Insufficient credits: UI block required but not proven (banner=${uiWarningVisible}, runCouncil=${runCouncilRequestSeen}, status=${runCouncilStatus ?? "n/a"}, estimate=${estimateRequestSeen}). ${formatGuardDiagnostics(diagnostics)}`,
    );
  }

  if (turnsAfter !== turnsBefore) {
    throw new Error(
      `Insufficient credits: conversation gained turns (${turnsBefore} → ${turnsAfter}).`,
    );
  }
  if (historyRunsAfter !== historyRunsBefore) {
    throw new Error(
      `Insufficient credits: history runs increased (${historyRunsBefore} → ${historyRunsAfter}).`,
    );
  }
  expectCredits(finalSummary, creditsSetForTest);

  await expect(composer).toBeEnabled();

  return diagnostics;
}

export function formatGuardDiagnostics(d: InsufficientCreditsGuardDiagnostics): string {
  return [
    `startingCredits=${d.startingCredits}`,
    `creditsSetForTest=${d.creditsSetForTest}`,
    `attemptedWorkflow=${d.attemptedWorkflow}`,
    `expectedCredits=${d.expectedCredits}`,
    `uiWarningVisible=${d.uiWarningVisible}`,
    `errorMessageVisible=${d.errorMessageVisible}`,
    `requireUiBanner=${d.requireUiBanner}`,
    `apiGuardConfirmed=${d.apiGuardConfirmed}`,
    `uiWarningNote=${d.uiWarningNote ?? "none"}`,
    `blockedEventFound=${d.blockedEventFound}`,
    `serverPreflight402=${d.serverPreflight402}`,
    `blockPath=${d.blockPath}`,
    `runCouncilRequestSeen=${d.runCouncilRequestSeen}`,
    `runCouncilStatus=${d.runCouncilStatus ?? "n/a"}`,
    `estimateRequestSeen=${d.estimateRequestSeen}`,
    `confirmModalSeen=${d.confirmModalSeen}`,
    `workflowSelected=${d.workflowSelected ?? "n/a"}`,
    `tokenModeSelected=${d.tokenModeSelected ?? "n/a"}`,
    `composerValueLength=${d.composerValueLength}`,
    `sendClicked=${d.sendClicked}`,
    `finalCredits=${d.finalCredits}`,
    `turns=${d.turnsBefore}→${d.turnsAfter}`,
    `historyRuns=${d.historyRunsBefore}→${d.historyRunsAfter}`,
  ].join("; ");
}
