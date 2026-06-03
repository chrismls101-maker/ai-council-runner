/**
 * Artifact / Builder visual QA helpers — post Execution Mode composer layout.
 */

import { expect, type Page } from "@playwright/test";
import { qaLog } from "./qaEnv.js";
import { pause, openComposerConfigure } from "./qaStepHelpers.js";
import { waitForRunComplete, type RunWaitOptions } from "./runWaitHelpers.js";

export type BuilderOrRunPhase =
  | "builder_confirm"
  | "builder_canvas"
  | "conversation_turn"
  | "run_complete"
  | "error_banner";

export interface BuilderOrRunResult {
  phase: BuilderOrRunPhase;
}

async function readComposerBanner(page: Page): Promise<string> {
  const banner = page.locator('[data-testid="composer-error"], [data-testid="composer-warning"]');
  if ((await banner.count()) === 0) return "";
  return (await banner.first().innerText().catch(() => "")).slice(0, 200);
}

/**
 * After submit, wait for Builder confirmation, Builder canvas, conversation activity, or error.
 * Does not require a conversation turn first when pre-run Builder confirm appears.
 */
export async function waitForBuilderOrRunResult(
  page: Page,
  label: string,
  timeoutMs = 30_000,
): Promise<BuilderOrRunResult> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const banner = await readComposerBanner(page);
    if (banner) {
      qaLog(`[${label}] Composer banner: ${banner.slice(0, 80)}`);
      return { phase: "error_banner" };
    }

    if (await page.getByTestId("builder-mode-confirm").isVisible().catch(() => false)) {
      return { phase: "builder_confirm" };
    }

    if (await page.getByTestId("builder-canvas").isVisible().catch(() => false)) {
      return { phase: "builder_canvas" };
    }

    const turnCount = await page.getByTestId("conversation-turn").count();
    if (turnCount > 0) {
      const turn = page.getByTestId("conversation-turn").last();
      const hasFinal = await turn.getByTestId("final-answer").isVisible().catch(() => false);
      const hasRunStatus = (await turn.getByTestId("run-status").count()) > 0;
      const stopVisible = await page
        .getByRole("button", { name: "Stop council run" })
        .isVisible()
        .catch(() => false);
      if (hasFinal || hasRunStatus || stopVisible) {
        return { phase: "conversation_turn" };
      }
    }

    await page.waitForTimeout(300);
  }

  throw new Error(`${label}: timed out waiting for Builder confirmation, canvas, or conversation turn`);
}

/** Dismiss pre-run or post-answer Builder confirmation if visible. */
export async function dismissBuilderConfirmIfVisible(
  page: Page,
  choice: "keep_in_chat" | "open_builder" = "keep_in_chat",
): Promise<boolean> {
  const confirm = page.getByTestId("builder-mode-confirm");
  if (!(await confirm.isVisible().catch(() => false))) return false;

  if (choice === "open_builder") {
    await confirm.getByRole("button", { name: /Open Builder/i }).click();
  } else {
    await confirm.getByRole("button", { name: /Keep in Chat/i }).click();
  }
  await expect(confirm).toBeHidden({ timeout: 15_000 });
  return true;
}

/**
 * Submit flow for large builds: handle Builder confirm → optional run complete.
 */
export async function waitForLargeBuildArtifactResult(
  page: Page,
  options: {
    label: string;
    runWait?: RunWaitOptions;
    builderChoice?: "keep_in_chat" | "open_builder";
  },
): Promise<BuilderOrRunResult> {
  const first = await waitForBuilderOrRunResult(page, options.label, 45_000);

  if (first.phase === "builder_confirm") {
    await expect(page.getByRole("heading", { name: /Open Builder Mode/i })).toBeVisible();
    await dismissBuilderConfirmIfVisible(page, options.builderChoice ?? "keep_in_chat");
    await pause(page, 400);
  }

  if (first.phase === "builder_canvas") {
    return first;
  }

  if (first.phase === "error_banner") {
    return first;
  }

  if (options.runWait && process.env.ARTIFACT_QA_SKIP_LIVE !== "1") {
    await waitForRunComplete(page, options.runWait);
    return { phase: "run_complete" };
  }

  if (first.phase === "conversation_turn") {
    return first;
  }

  const after = await waitForBuilderOrRunResult(page, `${options.label} (after confirm)`, 20_000);
  return after;
}
