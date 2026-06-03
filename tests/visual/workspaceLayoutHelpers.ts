/**
 * IIVO workspace layout helpers for Playwright QA.
 *
 * Layout modes (see App.tsx):
 * - Landing: `.chat-workspace.landing-mode` — hero + composer in "Start a decision"
 * - Conversation: `.chat-workspace.conversation-mode` — thread + pinned composer
 * - Builder: `[data-testid="builder-canvas"]` — five-tab workspace
 * - Side panels: settings, memory, etc. hide the chat thread
 */

import { expect, type Locator, type Page } from "@playwright/test";
import { getLatestTurn } from "./turnHelpers.js";
import { installNeutralPresetInit } from "./qaPresetHelpers.js";
import { pause } from "./qaStepHelpers.js";

export type BuilderTabId = "compose" | "inspect" | "improve" | "package" | "visuals" | "execute";

export async function installQaWorkspaceInit(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("iivo_onboarding_v1_completed", "true");
    localStorage.setItem("iivo_selected_preset_v2", "none");
    localStorage.setItem("iivo_preset_neutral_migration_v1", "1");
    localStorage.removeItem("iivo_selected_preset");
  });
  await installNeutralPresetInit(page);
}

export async function dismissOnboardingIfVisible(page: Page): Promise<void> {
  const modal = page.getByTestId("onboarding-modal");
  if (!(await modal.isVisible().catch(() => false))) return;
  const getStarted = page.getByTestId("onboarding-get-started");
  if (await getStarted.isVisible().catch(() => false)) {
    await getStarted.click();
  } else {
    await page.getByTestId("onboarding-skip").click();
  }
  await expect(modal).toBeHidden({ timeout: 10_000 });
}

/** Open Decision Console from sidebar if a side panel hid the chat workspace. */
export async function ensureDecisionConsole(page: Page): Promise<void> {
  const workspace = page.locator(".chat-workspace");
  if (await workspace.isVisible().catch(() => false)) return;

  const consoleBtn = page.getByTestId("decision-console");
  if (await consoleBtn.isVisible().catch(() => false)) {
    await consoleBtn.click();
    await pause(page, 300);
  }
}

/**
 * Baseline workspace boot: onboarding dismissed, Decision Console visible, composer ready.
 * Works on landing or conversation layouts.
 */
export async function bootstrapQaWorkspace(page: Page): Promise<void> {
  await installQaWorkspaceInit(page);
  await page.goto("/");
  await dismissOnboardingIfVisible(page);
  await ensureDecisionConsole(page);
  await expect(page.getByTestId("decision-console")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });
}

export async function assertLandingMode(page: Page): Promise<void> {
  await expect(page.locator(".chat-workspace.landing-mode")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: "Start a decision" })).toBeVisible();
  await expect(page.getByTestId("conversation-turn")).toHaveCount(0);
}

export async function assertConversationMode(page: Page): Promise<void> {
  await expect(page.locator(".chat-workspace.conversation-mode")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".chat-thread-scroll")).toBeVisible();
  await expect(page.getByTestId("conversation-turn").last()).toBeVisible({ timeout: 15_000 });
}

export async function assertBuilderMode(page: Page): Promise<void> {
  await expect(page.getByTestId("builder-canvas")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("builder-tabs")).toBeVisible();
  await expect(page.getByTestId("build-map-panel")).toBeVisible();
}

export async function seedMockConversationThread(
  page: Page,
  turns: Record<string, unknown>[],
): Promise<Locator> {
  await bootstrapQaWorkspace(page);
  const threadJson = JSON.stringify(turns);
  await page.evaluate((payload: string) => {
    sessionStorage.setItem("iivo-conversation-thread", payload);
  }, threadJson);
  await page.reload();
  await dismissOnboardingIfVisible(page);
  await ensureDecisionConsole(page);
  await assertConversationMode(page);
  const turn = getLatestTurn(page);
  await expect(turn.getByTestId("artifact-renderer")).toBeVisible({ timeout: 15_000 });
  return turn;
}

export async function openBuilderFromTurn(page: Page, turn?: Locator): Promise<void> {
  const target = turn ?? getLatestTurn(page);
  await expect(target.getByTestId("artifact-renderer")).toBeVisible({ timeout: 15_000 });
  await target.getByTestId("open-in-builder").scrollIntoViewIfNeeded();
  await target.getByTestId("open-in-builder").click();
  await assertBuilderMode(page);
}

export async function navigateBuilderTab(page: Page, tab: BuilderTabId): Promise<void> {
  await page.getByTestId(`builder-tab-${tab}`).click();
  await expect(page.getByTestId(`builder-panel-${tab}`)).toBeVisible({ timeout: 10_000 });
}

export async function backToChatFromBuilder(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Back to Chat" }).click();
  await assertConversationMode(page);
}
