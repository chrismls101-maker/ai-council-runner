/**
 * Preset helpers for Visual QA — neutral default, explicit opt-in.
 * Preset control lives under Configure (not primary composer bar).
 */

import { expect, type Page } from "@playwright/test";
import { openComposerConfigure, selectPillOption } from "./qaStepHelpers.js";

const SELECTED_PRESET_STORAGE_KEY = "iivo_selected_preset_v2";

import { AI_FRONT_DESK_BLEED_TERMS } from "./qaBleedScoring.js";

export { AI_FRONT_DESK_BLEED_TERMS };

export function neutralPresetInitScriptBody(): string {
  return `(() => {
    try {
      localStorage.setItem(${JSON.stringify(SELECTED_PRESET_STORAGE_KEY)}, "none");
      localStorage.setItem("iivo_preset_neutral_migration_v1", "1");
      localStorage.removeItem("iivo_selected_preset");
    } catch {}
  })();`;
}

export async function installNeutralPresetInit(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("iivo_selected_preset_v2", "none");
      localStorage.setItem("iivo_preset_neutral_migration_v1", "1");
      localStorage.removeItem("iivo_selected_preset");
    } catch {
      /* ignore */
    }
  });
}

export async function ensureNeutralPreset(page: Page, options?: { reload?: boolean }): Promise<void> {
  await installNeutralPresetInit(page);
  if (options?.reload !== false && !page.url().includes("about:blank")) {
    await page.reload();
  }
}

/** Primary composer bar ready for a run (Execution Mode layout). */
export async function assertComposerReadyForRun(page: Page): Promise<void> {
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("execution-mode-select")).toBeVisible();
  await expect(page.getByTestId("composer-configure")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add context" })).toBeVisible();
  await expect(page.getByTestId("preset-select")).not.toBeVisible();
  await expect(page.getByTestId("workflow-select")).not.toBeVisible();
}

/** Neutral preset via Configure panel (preset moved off primary bar). */
export async function assertNeutralPresetConfigured(page: Page): Promise<void> {
  await openComposerConfigure(page);
  const presetPill = page.getByTestId("preset-select");
  await expect(presetPill).toBeVisible({ timeout: 15_000 });
  await expect(presetPill).toContainText(/No preset/i);
}

/** @deprecated Use assertNeutralPresetConfigured — kept for callers that mean Configure preset. */
export async function assertNeutralPresetActive(page: Page): Promise<void> {
  await assertNeutralPresetConfigured(page);
}

export async function selectWorkspacePreset(
  page: Page,
  label: "No preset" | "AI Front Desk Sales Test",
): Promise<void> {
  await openComposerConfigure(page);
  await selectPillOption(page, "preset-select", label);
}

export function detectPresetBleed(text: string, allowedTerms: string[] = []): string[] {
  const allowedLower = allowedTerms.map((t) => t.toLowerCase());
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const term of AI_FRONT_DESK_BLEED_TERMS) {
    if (!lower.includes(term.toLowerCase())) continue;
    const t = term.toLowerCase();
    if (
      allowedLower.some((a) => t === a || t.includes(a) || a.includes(t))
    ) {
      continue;
    }
    hits.push(term);
  }
  return hits;
}

export async function assertNoPresetBleed(
  page: Page,
  answer: string,
  context: string,
): Promise<void> {
  const hits = detectPresetBleed(answer);
  if (hits.length > 0) {
    throw new Error(
      `${context}: AI Front Desk preset bleed detected (${hits.join(", ")}). Ensure neutral preset before run.`,
    );
  }
}
