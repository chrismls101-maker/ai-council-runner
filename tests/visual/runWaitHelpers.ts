/**
 * Helpers for waiting on live IIVO council runs during Visual QA.
 */

import { expect, type Page } from "@playwright/test";
import { qaLog } from "./qaEnv.js";
import { markQaCheck, qaClick, updateQaMonitor } from "./qaMonitor.js";
import { countConversationTurns, getLatestTurn } from "./turnHelpers.js";

export interface RunWaitDiagnostics {
  phase: "still_running" | "complete" | "partial" | "error" | "unknown" | "timed_out";
  stopButtonVisible: boolean;
  runStatusAttr: string | null;
  finalAnswerExists: boolean;
  finalAnswerLength: number;
  finalAnswerPreview: string;
  routeText: string;
  hasPartialBadge: boolean;
  hasErrorBadge: boolean;
}

export class RunWaitTimeoutError extends Error {
  readonly diagnostics: RunWaitDiagnostics;

  constructor(message: string, diagnostics: RunWaitDiagnostics) {
    super(message);
    this.name = "RunWaitTimeoutError";
    this.diagnostics = diagnostics;
  }
}

function activeTurn(page: Page) {
  return getLatestTurn(page);
}

export async function collectRunDiagnostics(page: Page): Promise<RunWaitDiagnostics> {
  if (page.isClosed()) {
    return {
      phase: "timed_out",
      stopButtonVisible: false,
      runStatusAttr: null,
      finalAnswerExists: false,
      finalAnswerLength: 0,
      finalAnswerPreview: "",
      routeText: "(page closed)",
      hasPartialBadge: false,
      hasErrorBadge: false,
    };
  }

  const turn = activeTurn(page);
  const stopBtn = page.getByRole("button", { name: "Stop council run" });
  const stopButtonVisible = await stopBtn.isVisible().catch(() => false);

  const runStatusAttr = await turn
    .getByTestId("run-status")
    .getAttribute("data-status")
    .catch(() => null);

  const finalAnswer = turn.getByTestId("final-answer");
  const finalAnswerExists = await finalAnswer.isVisible().catch(() => false);
  let finalAnswerPreview = "";
  if (finalAnswerExists) {
    finalAnswerPreview = (await finalAnswer.innerText().catch(() => "")).slice(0, 300);
  }

  const routeLocator = turn.locator(
    '[data-testid="router-status"], [data-testid="workflow-status"]',
  );
  const routeText =
    (await routeLocator
      .last()
      .innerText()
      .catch(() => "")) || "(route status unavailable)";

  const hasPartialBadge = (await turn.locator(".run-badge.status-partial").count()) > 0;
  const hasErrorBadge = (await turn.locator(".run-badge.status-error").count()) > 0;

  let phase: RunWaitDiagnostics["phase"] = "unknown";
  if (stopButtonVisible) {
    phase = "still_running";
  } else if (runStatusAttr === "complete") {
    phase = "complete";
  } else if (runStatusAttr === "partial" || hasPartialBadge) {
    phase = "partial";
  } else if (runStatusAttr === "error" || hasErrorBadge) {
    phase = "error";
  } else if (finalAnswerExists) {
    phase = "unknown";
  }

  return {
    phase,
    stopButtonVisible,
    runStatusAttr,
    finalAnswerExists,
    finalAnswerLength: finalAnswerPreview.length,
    finalAnswerPreview,
    routeText: routeText.replace(/\s+/g, " ").trim(),
    hasPartialBadge,
    hasErrorBadge,
  };
}

function formatDiagnostics(d: RunWaitDiagnostics): string {
  return [
    `phase=${d.phase}`,
    `stopButtonVisible=${d.stopButtonVisible}`,
    `runStatus=${d.runStatusAttr ?? "none"}`,
    `finalAnswerExists=${d.finalAnswerExists}`,
    `finalAnswerLength=${d.finalAnswerLength}`,
    `routeText=${d.routeText.slice(0, 120)}`,
    d.finalAnswerPreview ? `finalAnswerPreview=${d.finalAnswerPreview.slice(0, 300)}` : "",
    d.hasPartialBadge ? "partialBadge=true" : "",
    d.hasErrorBadge ? "errorBadge=true" : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function hasComposerOrRunErrorBanner(page: Page): Promise<boolean> {
  const selectors = [
    '[data-testid="composer-error"]',
    '[data-testid="composer-warning"]',
    '[data-testid="run-error-banner"]',
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel);
    if ((await loc.count()) > 0 && (await loc.first().isVisible().catch(() => false))) {
      return true;
    }
  }
  return false;
}

export interface WaitForRunActivityOptions {
  /** Turn count before submit — activity detected when count increases. */
  turnsBefore?: number;
  onPoll?: (elapsedSec: number, diagnostics: RunWaitDiagnostics) => void | Promise<void>;
  onFastComplete?: () => void | Promise<void>;
  onStopVisible?: () => void | Promise<void>;
  logPrefix?: string;
}

/**
 * Wait until any run activity signal appears after submit (turn, status, answer, stop, error).
 * Does not require the stop button. Throws RunWaitTimeoutError if nothing appears in time.
 */
export async function waitForRunActivityOrComplete(
  page: Page,
  timeoutMs: number,
  options?: WaitForRunActivityOptions,
): Promise<RunWaitDiagnostics> {
  const log = (msg: string) =>
    qaLog(options?.logPrefix ? `${options.logPrefix}: ${msg}` : msg);
  const started = Date.now();
  const turnsBefore = options?.turnsBefore ?? (await countConversationTurns(page));
  let lastPollSec = -1;

  while (Date.now() - started < timeoutMs) {
    if (page.isClosed()) {
      throw new RunWaitTimeoutError("Page closed while waiting for run activity", {
        ...(await collectRunDiagnostics(page)),
        phase: "timed_out",
      });
    }

    const turnsAfter = await countConversationTurns(page);
    const diagnostics = await collectRunDiagnostics(page);
    const errorBanner = await hasComposerOrRunErrorBanner(page);

    if (turnsAfter > turnsBefore) {
      log(`Run activity: conversation turn count ${turnsBefore} → ${turnsAfter}`);
      return diagnostics;
    }
    if (diagnostics.stopButtonVisible) {
      log("Stop button visible — council run in progress");
      await options?.onStopVisible?.();
      return diagnostics;
    }
    if (diagnostics.finalAnswerExists) {
      log("Fast answer detected — final-answer visible");
      await options?.onFastComplete?.();
      return diagnostics;
    }
    if (diagnostics.runStatusAttr) {
      log(`Run activity: run-status=${diagnostics.runStatusAttr}`);
      return diagnostics;
    }
    if (errorBanner || diagnostics.hasErrorBadge) {
      log("Run activity: error banner or error badge detected");
      return diagnostics;
    }

    const elapsedSec = Math.floor((Date.now() - started) / 1000);
    if (elapsedSec > 0 && elapsedSec % 10 === 0 && elapsedSec !== lastPollSec) {
      lastPollSec = elapsedSec;
      log(`Still waiting for run activity (${elapsedSec}s)…`);
      await options?.onPoll?.(elapsedSec, diagnostics);
    }

    await page.waitForTimeout(300);
  }

  const diagnostics = await collectRunDiagnostics(page);
  const turnsAfter = await countConversationTurns(page);
  const errorBanner = await hasComposerOrRunErrorBanner(page);
  const hasActivity =
    turnsAfter > turnsBefore ||
    diagnostics.stopButtonVisible ||
    diagnostics.finalAnswerExists ||
    !!diagnostics.runStatusAttr ||
    errorBanner ||
    diagnostics.hasErrorBadge;

  if (!hasActivity) {
    throw new RunWaitTimeoutError(
      "Run activity not observed after successful submit.",
      { ...diagnostics, phase: "timed_out" },
    );
  }

  return diagnostics;
}

async function waitForStopButtonHidden(
  page: Page,
  timeoutMs: number,
  pollLog?: (elapsedSec: number, diagnostics: RunWaitDiagnostics) => void,
  skipStopVisibleWait?: boolean,
): Promise<void> {
  const stopBtn = page.getByRole("button", { name: "Stop council run" });
  const started = Date.now();

  const early = await collectRunDiagnostics(page);
  if (skipStopVisibleWait || (early.finalAnswerExists && !early.stopButtonVisible)) {
    qaLog("Final answer already visible — skipping stop-button wait");
    return;
  }

  const becameVisible = await stopBtn
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);

  if (becameVisible) {
    qaLog("Stop button visible — council run in progress");
  } else {
    qaLog("Stop button not seen — run may finish quickly or already completed");
  }

  while (Date.now() - started < timeoutMs) {
    if (page.isClosed()) {
      throw new RunWaitTimeoutError("Page closed while waiting for run to complete", {
        ...(await collectRunDiagnostics(page)),
        phase: "timed_out",
      });
    }

    const hidden = await stopBtn.isHidden().catch(() => true);
    if (hidden) {
      qaLog("Stop button hidden — proceeding to verify final answer");
      return;
    }

    const elapsedSec = Math.floor((Date.now() - started) / 1000);
    if (elapsedSec > 0 && elapsedSec % 30 === 0) {
      const diagnostics = await collectRunDiagnostics(page);
      qaLog(
        `Still waiting (${elapsedSec}s) — runStatus=${diagnostics.runStatusAttr ?? "none"}, stopVisible=${diagnostics.stopButtonVisible}`,
      );
      pollLog?.(elapsedSec, diagnostics);
    }

    if (page.isClosed()) {
      throw new RunWaitTimeoutError("Page closed while waiting for run to complete", {
        ...(await collectRunDiagnostics(page)),
        phase: "timed_out",
      });
    }

    await page.waitForTimeout(2000);
  }

  const diagnostics = await collectRunDiagnostics(page);
  throw new RunWaitTimeoutError(
    `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for council run to finish.\n${formatDiagnostics({ ...diagnostics, phase: "timed_out" })}`,
    { ...diagnostics, phase: "timed_out" },
  );
}

export async function waitForRunComplete(
  page: Page,
  options: {
    status: string;
    warning?: string;
    waitingCheckLabel?: string;
    liveApiWarning?: string;
    /** Max time to wait for Stop button to hide (default 4 min). Step D uses 5 min. */
    runWaitTimeoutMs?: number;
    /** Label prefix for diagnostic logs (e.g. "Step D"). */
    logPrefix?: string;
    /** Called every ~30s while waiting (e.g. Daily Driver Agent Mind narration). */
    onWaitPoll?: (elapsedSec: number, diagnostics: RunWaitDiagnostics) => void | Promise<void>;
  },
): Promise<void> {
  const log = (msg: string) => qaLog(options.logPrefix ? `${options.logPrefix}: ${msg}` : msg);
  const liveWarning =
    options.warning ??
    options.liveApiWarning ??
    "Live API call in progress — waiting for IIVO response (typically 1–4 minutes).";

  await updateQaMonitor(page, {
    status: options.status,
    warning: liveWarning,
  });
  if (options.waitingCheckLabel) {
    await markQaCheck(page, options.waitingCheckLabel, "active");
  }

  const runWaitTimeoutMs = options.runWaitTimeoutMs ?? 240_000;
  let lastPollLogSec = 0;

  const activity = await waitForRunActivityOrComplete(page, 20_000, {
    logPrefix: options.logPrefix,
    onFastComplete: async () => {
      log("Fast completion detected — final answer present without stop button");
    },
    onStopVisible: async () => {
      log("Stop button visible — council run in progress");
    },
    onPoll: async (elapsedSec, diagnostics) => {
      log(`Waiting for run activity (${elapsedSec}s) — route: ${diagnostics.routeText.slice(0, 60)}`);
      await options.onWaitPoll?.(elapsedSec, diagnostics);
    },
  });
  const fastComplete = activity.finalAnswerExists && !activity.stopButtonVisible;
  if (fastComplete) {
    log("Fast Direct Answer path — proceeding to verify final answer");
  }

  try {
    await waitForStopButtonHidden(page, runWaitTimeoutMs, async (elapsedSec, diagnostics) => {
      if (elapsedSec - lastPollLogSec < 30) return;
      lastPollLogSec = elapsedSec;
      log(`Waiting for council response (${elapsedSec}s elapsed)`);
      log(`runStatus=${diagnostics.runStatusAttr ?? "none"}, stopVisible=${diagnostics.stopButtonVisible}`);
      await options.onWaitPoll?.(elapsedSec, diagnostics);
    }, fastComplete);
  } catch (err) {
    if (err instanceof RunWaitTimeoutError) {
      log(`Run wait timed out — ${err.message}`);
      throw err;
    }
    throw err;
  }

  const skipTyping = page.getByRole("button", { name: "Show full answer" });
  if (await skipTyping.isVisible().catch(() => false)) {
    await qaClick(page, skipTyping, "Skip typewriter — show full answer");
    await page.waitForTimeout(500);
  }

  const turnCount = await countConversationTurns(page);
  if (turnCount === 0) {
    throw new RunWaitTimeoutError("No conversation turn after submit", {
      ...(await collectRunDiagnostics(page)),
      phase: "timed_out",
    });
  }

  const turn = activeTurn(page);
  const finalAnswer = turn.getByTestId("final-answer");

  await expect(finalAnswer).toBeVisible({ timeout: 45_000 });
  log("Final answer detected");

  await expect(finalAnswer).not.toHaveText("", { timeout: 60_000 });
  const answerLen = (await finalAnswer.innerText()).length;
  log(`Final answer length=${answerLen}`);

  const runStatus = turn.getByTestId("run-status");
  const statusAttached = (await runStatus.count()) > 0;
  if (statusAttached) {
    const statusAttr = await runStatus.getAttribute("data-status");
    log(`run-status data-status=${statusAttr ?? "none"}`);
    await expect(runStatus).toHaveAttribute("data-status", "complete", { timeout: 30_000 });
    await expect(turn.locator(".run-badge.status-partial")).toHaveCount(0);
    await expect(turn.locator(".run-badge.status-error")).toHaveCount(0);
  } else {
    log("run-status not attached — accepting final-answer on latest turn (fast Direct Answer)");
  }

  if (options.waitingCheckLabel) {
    await markQaCheck(page, options.waitingCheckLabel, "pass");
  }
  await updateQaMonitor(page, { warning: null });
  log("Run completed.");
}
