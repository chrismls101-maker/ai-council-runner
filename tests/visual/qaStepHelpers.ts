/**
 * Shared Visual QA step helpers — used across Playwright proof runners.
 */

import { expect, type Page } from "@playwright/test";
import { pauseMs, qaLog } from "./qaEnv.js";
import { failQaStep, qaClick } from "./qaMonitor.js";
import { RunWaitTimeoutError } from "./runWaitHelpers.js";
import { countConversationTurns, getLatestTurn } from "./turnHelpers.js";

export const APP_URL = "http://localhost:5173";
export const API_BASE = "http://localhost:3001";

export async function pause(page: Page, ms = 500): Promise<void> {
  if (page.isClosed()) return;
  await page.waitForTimeout(pauseMs(ms));
}

export async function ensureAppRunning(): Promise<void> {
  try {
    const res = await fetch(APP_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error("bad status");
  } catch {
    throw new Error("Start IIVO first with npm run dev.");
  }
}

export async function openComposerConfigure(page: Page): Promise<void> {
  const panel = page.locator("#composer-configure-panel");
  if (!(await panel.isVisible().catch(() => false))) {
    await qaClick(page, page.getByTestId("composer-configure"), "Open Configure");
    await pause(page, 300);
  }
}

/** Collapse Configure so primary composer checks (preset hidden) pass. */
export async function closeComposerConfigure(page: Page): Promise<void> {
  const panel = page.locator("#composer-configure-panel");
  if (!(await panel.isVisible().catch(() => false))) return;

  await page.keyboard.press("Escape");
  await pause(page, 200);

  if (await panel.isVisible().catch(() => false)) {
    await qaClick(page, page.getByTestId("composer-configure"), "Close Configure");
    await pause(page, 200);
  }

  await expect(panel).not.toBeVisible({ timeout: 5_000 });
}

export async function selectPillOption(
  page: Page,
  triggerTestId: string,
  optionLabel: string,
  nextLabel?: string,
  options?: { exact?: boolean },
): Promise<void> {
  const trigger = page.getByTestId(triggerTestId);
  await qaClick(page, trigger, nextLabel);
  await pause(page, 300);
  const option = options?.exact
    ? page.getByRole("option", { name: optionLabel, exact: true })
    : page.getByRole("option", { name: new RegExp(optionLabel, "i") });
  await qaClick(page, option);
  await pause(page, 500);
}

export function activeTurn(page: Page) {
  return getLatestTurn(page);
}

export { getLatestTurn, logLatestTurnDebug, expectLatestTurnRoute, countConversationTurns } from "./turnHelpers.js";

export async function runQaStep<T>(
  page: Page,
  stepLabel: string,
  fn: () => Promise<T>,
  options?: {
    suggestion?: string;
    failureHint?: "live" | "estimate-guard" | "timeout";
  },
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout =
      message.includes("timeout") ||
      message.includes("Timeout") ||
      err instanceof RunWaitTimeoutError;

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

    const defaultSuggestion = isTimeout
      ? "Test timed out — check run wait limits, selectors, or run this test alone with a fresh dev server."
      : options?.failureHint === "live"
        ? "Live run failed — check API keys and provider logs. Re-run with npm run qa:usage:record."
        : options?.failureHint === "estimate-guard"
          ? "Estimate/guard failed — check usage API, credit rules, and client pre-run guard. No provider keys required."
          : "Re-run with npm run qa:usage:record to capture trace/video.";

    await failQaStep(page, stepLabel, {
      message,
      actual,
      suggestion: options?.suggestion ?? defaultSuggestion,
    });
    throw err;
  }
}

/** Fixed delay for API-only QA steps (no watch/step multiplier). */
export async function pauseQuick(page: Page, ms = 300): Promise<void> {
  if (page.isClosed()) return;
  await page.waitForTimeout(ms);
}

export type RunGateCouncilChoice = "keep-quick" | "use-council";

export interface DismissRunGateModalsOptions {
  /** Default keep-quick for faster automated runs. */
  councilChoice?: RunGateCouncilChoice;
  maxRounds?: number;
}

export interface DismissRunGateModalsResult {
  councilDismissed: boolean;
  creditDismissed: boolean;
}

/** Auto-accept council/credit confirmation gates so visual QA stays hands-off. */
export async function dismissRunGateModals(
  page: Page,
  options: DismissRunGateModalsOptions = {},
): Promise<DismissRunGateModalsResult> {
  const councilChoice = options.councilChoice ?? "keep-quick";
  const maxRounds = options.maxRounds ?? 4;
  let councilDismissed = false;
  let creditDismissed = false;

  for (let round = 0; round < maxRounds; round += 1) {
    await pauseQuick(page, 150);
    let acted = false;

    const councilOverlay = page.getByTestId("council-mode-confirm");
    if (await councilOverlay.isVisible().catch(() => false)) {
      councilDismissed = true;
      qaLog(`[Run gate] Council confirm visible — choosing ${councilChoice}`);
      const councilButton =
        councilChoice === "use-council"
          ? page.getByTestId("council-confirm-use-council")
          : page.getByTestId("council-confirm-keep-quick");
      await councilButton.click();
      acted = true;
      await pauseQuick(page, 250);
    }

    const creditModal = page.getByTestId("credit-confirm-modal");
    if (await creditModal.isVisible().catch(() => false)) {
      creditDismissed = true;
      qaLog("[Run gate] Credit confirm visible — clicking Continue");
      await page.getByTestId("credit-confirm-continue").click();
      acted = true;
      await pauseQuick(page, 250);
    }

    if (!acted) break;
  }

  return { councilDismissed, creditDismissed };
}

export interface SubmitPromptDiagnostics {
  turnsBefore: number;
  turnsAfter: number;
  composerLenBefore: number;
  composerCleared: boolean;
  sendEnabled: boolean;
  retried: boolean;
  url: string;
  bannerText: string;
}

export class SubmitNotFiredError extends Error {
  readonly diagnostics: SubmitPromptDiagnostics;

  constructor(message: string, diagnostics: SubmitPromptDiagnostics) {
    super(message);
    this.name = "SubmitNotFiredError";
    this.diagnostics = diagnostics;
  }
}

async function readComposerBanner(page: Page): Promise<string> {
  const banner = page.locator('[data-testid="composer-error"], [data-testid="composer-warning"]');
  if ((await banner.count()) === 0) return "";
  return (await banner.first().innerText().catch(() => "")).slice(0, 200);
}

async function submitOnce(page: Page, prompt: string, useClick: boolean): Promise<void> {
  const composer = page.getByTestId("composer-input");
  await composer.click();
  await composer.fill(prompt);
  await pause(page, 200);
  if (useClick) {
    const send = page.getByTestId("composer-send");
    await send.waitFor({ state: "visible", timeout: 10_000 });
    await send.click();
  } else {
    await composer.press("Enter");
  }
  await page.waitForTimeout(100);
}

/** Wait until submit produced a turn, run status, final answer, stop button, or composer error. */
export async function waitForSubmitAcknowledged(
  page: Page,
  turnsBefore: number,
  timeoutMs = 25_000,
): Promise<{ turnsAfter: number; errorBanner: string }> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const turnsAfter = await countConversationTurns(page);
    if (turnsAfter > turnsBefore) {
      return { turnsAfter, errorBanner: await readComposerBanner(page) };
    }

    const turn = page.getByTestId("conversation-turn").last();
    const hasRunStatus = (await turn.getByTestId("run-status").count()) > 0;
    const hasFinal = await turn.getByTestId("final-answer").isVisible().catch(() => false);
    const stopVisible = await page
      .getByRole("button", { name: "Stop council run" })
      .isVisible()
      .catch(() => false);
    const banner = await readComposerBanner(page);
    if (banner || hasRunStatus || hasFinal || stopVisible) {
      return { turnsAfter, errorBanner: banner };
    }

    await page.waitForTimeout(250);
  }

  return {
    turnsAfter: await countConversationTurns(page),
    errorBanner: await readComposerBanner(page),
  };
}

export async function submitComposerPrompt(page: Page, prompt: string): Promise<void> {
  await submitComposerPromptRobust(page, prompt);
}

export async function submitComposerPromptRobust(
  page: Page,
  prompt: string,
  options?: { onRetryNarration?: (message: string) => void | Promise<void> },
): Promise<SubmitPromptDiagnostics> {
  const turnsBefore = await countConversationTurns(page);
  const composer = page.getByTestId("composer-input");
  const composerLenBefore = (await composer.inputValue().catch(() => "")).length;
  const send = page.getByTestId("composer-send");
  const sendEnabled = await send.isEnabled().catch(() => false);

  await submitOnce(page, prompt, true);
  await dismissRunGateModals(page);
  let ack = await waitForSubmitAcknowledged(page, turnsBefore);
  let retried = false;

  if (ack.turnsAfter <= turnsBefore && !ack.errorBanner) {
    const msg = "Submit did not create a turn; retrying once.";
    qaLog(msg);
    await options?.onRetryNarration?.(msg);
    await composer.click();
    await composer.fill(prompt);
    await pause(page, 200);
    await send.click();
    retried = true;
    await dismissRunGateModals(page);
    ack = await waitForSubmitAcknowledged(page, turnsBefore);
  }

  const composerValue = await composer.inputValue().catch(() => "");
  const diagnostics: SubmitPromptDiagnostics = {
    turnsBefore,
    turnsAfter: ack.turnsAfter,
    composerLenBefore,
    composerCleared: composerValue.length === 0,
    sendEnabled,
    retried,
    url: page.url(),
    bannerText: ack.errorBanner,
  };

  if (ack.turnsAfter <= turnsBefore && !ack.errorBanner) {
    throw new SubmitNotFiredError(
      "Technical fail: send click did not produce a conversation turn.",
      diagnostics,
    );
  }

  return diagnostics;
}

export function parseCreditsBadge(text: string): { current: number; monthly: number } | null {
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  return { current: Number(match[1]), monthly: Number(match[2]) };
}
