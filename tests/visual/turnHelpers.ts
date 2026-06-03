/**
 * Playwright helpers for scoping assertions to the latest conversation turn.
 */

import { expect, type Locator, type Page } from "@playwright/test";
import { qaLog } from "./qaEnv.js";

export function getLatestTurn(page: Page): Locator {
  return page.getByTestId("conversation-turn").last();
}

export async function countConversationTurns(page: Page): Promise<number> {
  return page.getByTestId("conversation-turn").count();
}

export async function logLatestTurnDebug(page: Page, label: string): Promise<void> {
  const count = await countConversationTurns(page);
  qaLog(`${label}: conversation turns=${count}`);

  if (count === 0) {
    qaLog(`${label}: no conversation turns found`);
    return;
  }

  const latestTurn = getLatestTurn(page);
  const routeLocator = latestTurn.locator(
    '[data-testid="router-status"], [data-testid="workflow-status"]',
  );
  const routeCount = await routeLocator.count();
  let routeText = "(none)";
  if (routeCount > 0) {
    routeText = (await routeLocator.last().innerText()).replace(/\s+/g, " ").trim();
  }
  qaLog(`${label}: latest turn route=${routeText}`);

  const answerLen = await latestTurn
    .getByTestId("final-answer")
    .innerText()
    .then((text) => text.length)
    .catch(() => 0);
  qaLog(`${label}: latest turn answer length=${answerLen}`);
}

export async function expectLatestTurnRoute(
  page: Page,
  pattern: RegExp,
): Promise<void> {
  const latestTurn = getLatestTurn(page);
  const routeLocator = latestTurn.locator(
    '[data-testid="router-status"], [data-testid="workflow-status"]',
  );
  await expect(routeLocator.last()).toContainText(pattern, { timeout: 10_000 });
}

export async function expectLatestTurnComplete(page: Page): Promise<void> {
  const latestTurn = getLatestTurn(page);
  await expect(latestTurn.getByTestId("final-answer")).toBeVisible({ timeout: 30_000 });
  await expect(latestTurn.getByTestId("run-status")).toHaveAttribute("data-status", "complete", {
    timeout: 15_000,
  });
}
