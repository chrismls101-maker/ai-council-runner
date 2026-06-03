/**
 * Playwright helpers scoped to Context Bridge visual QA.
 */

import { expect, type Locator, type Page } from "@playwright/test";
import { getLatestTurn } from "./qaStepHelpers.js";
import { qaLog } from "./qaEnv.js";
import { qaClick } from "./qaMonitor.js";

export async function attachPastedContext(page: Page, title: string, text: string) {
  await page.locator(".composer-plus-btn").click();
  await page.getByTestId("context-bridge-paste-context").click();
  await page.getByTestId("paste-context-title-input").fill(title);
  await page.getByTestId("paste-context-text-input").fill(text);
  await page.getByTestId("paste-context-add-btn").click();
}

export function getContextLibraryList(page: Page): Locator {
  return page.getByTestId("context-library-list");
}

export function getContextLibraryItemTitle(page: Page, title: string): Locator {
  return getContextLibraryList(page)
    .getByTestId("context-library-item-title")
    .filter({ hasText: title })
    .first();
}

export async function selectContextLibraryItemByTitle(
  page: Page,
  title: string,
): Promise<void> {
  const itemTitle = getContextLibraryItemTitle(page, title);
  await expect(itemTitle).toBeVisible();
  await itemTitle.click();
}

export function getContextLibraryDetail(page: Page): Locator {
  return page.getByTestId("context-library-detail");
}

export async function expectContextLibraryItemAbsent(
  page: Page,
  title: string,
): Promise<void> {
  await expect(getContextLibraryItemTitle(page, title)).toHaveCount(0);
}

export async function expectContextLibraryItemPresent(
  page: Page,
  title: string,
): Promise<void> {
  await expect(getContextLibraryItemTitle(page, title)).toBeVisible();
}

export async function expectContextLibraryMemoryStatus(
  page: Page,
  title: string,
  pattern: RegExp,
): Promise<void> {
  await selectContextLibraryItemByTitle(page, title);
  const detail = getContextLibraryDetail(page);
  await expect(detail.getByTestId("context-library-detail-title")).toHaveText(title);
  await expect(detail.getByTestId("context-library-memory-status")).toContainText(pattern);
}

export async function logLatestTurnRoute(page: Page): Promise<void> {
  const latestTurn = getLatestTurn(page);
  const routeLocator = latestTurn.locator(
    '[data-testid="router-status"], [data-testid="workflow-status"]',
  );
  const routeCount = await routeLocator.count();
  const routeText =
    routeCount > 0
      ? (await routeLocator.last().innerText()).replace(/\s+/g, " ").trim()
      : "(none)";
  qaLog(`Latest turn route: ${routeText}`);
}

/** Open council Cost & Trace or Direct Answer Details, then return external context trace. */
export async function openLatestTurnDetailsForContextTrace(page: Page): Promise<Locator> {
  const latestTurn = getLatestTurn(page);

  const costTraceCount = await latestTurn.getByTestId("cost-trace").count();
  const directDetailsCount = await latestTurn.getByTestId("direct-answer-details").count();
  const responseDetailsCount = await latestTurn.getByTestId("response-details").count();
  const traceBefore = await latestTurn.getByTestId("external-context-trace").count();

  qaLog(`cost-trace exists=${costTraceCount > 0}`);
  qaLog(`direct-answer-details exists=${directDetailsCount > 0}`);
  qaLog(`response-details exists=${responseDetailsCount > 0}`);
  qaLog(`external-context-trace visible before open=${traceBefore > 0}`);

  if (costTraceCount > 0) {
    qaLog("Opening Cost & Trace panel");
    await qaClick(page, latestTurn.getByTestId("cost-trace"), "Open Cost & Trace");
  } else if (directDetailsCount > 0) {
    qaLog("Opening Direct Answer Details panel");
    await qaClick(page, latestTurn.getByTestId("direct-answer-details"), "Open Details");
  } else if (responseDetailsCount > 0) {
    qaLog("Opening response-details wrapper (fallback)");
    await qaClick(page, latestTurn.getByTestId("direct-answer-details"), "Open Details");
  } else {
    throw new Error(
      "Run completed but no details panel (cost-trace or direct-answer-details) was found.",
    );
  }

  const trace = latestTurn.getByTestId("external-context-trace");
  const traceAfter = await trace.count();
  qaLog(`external-context-trace visible after open=${traceAfter > 0}`);

  if (traceAfter === 0) {
    throw new Error(
      "Run completed but external context trace was not rendered for this response type.",
    );
  }

  await expect(trace).toBeVisible({ timeout: 15_000 });
  return trace;
}
