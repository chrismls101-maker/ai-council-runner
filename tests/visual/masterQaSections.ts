/**
 * Master QA section runners — orchestrated by iivo-master-qa.spec.ts
 */

import { expect, type Page } from "@playwright/test";
import type { MasterQaReport } from "./masterQaReport.js";
import { qaLog } from "./qaEnv.js";
import {
  completeQaStep,
  initQaMonitor,
  markQaCheck,
  showQaSuccess,
  updateQaMonitor,
} from "./qaMonitor.js";
import {
  attachPastedContext,
  expectContextLibraryItemAbsent,
  expectContextLibraryItemPresent,
  expectContextLibraryMemoryStatus,
  getContextLibraryDetail,
  selectContextLibraryItemByTitle,
} from "./contextBridgeTestHelpers.js";
import {
  createLensPageContextItem,
  createLensScreenshotItem,
  deleteContextItem,
} from "./masterQaFixtures.js";
import { runVisionMemoryGuardUnitTest } from "./masterQaVisionGuard.js";
import {
  assertUsageResetToDefault,
  estimateCredits,
  expectCredits,
  fetchUsageSummary,
  resetLocalCredits,
} from "./usageCreditsApi.js";
import {
  formatGuardDiagnostics,
  verifyInsufficientCreditsGuard,
} from "./usageCreditsGuardHelpers.js";
import {
  dismissRunGateModals,
  expectLatestTurnRoute,
  getLatestTurn,
  pause,
  pauseQuick,
  submitComposerPrompt,
} from "./qaStepHelpers.js";
import { waitForRunComplete } from "./runWaitHelpers.js";
import { installNeutralPresetInit, assertNeutralPresetActive } from "./qaPresetHelpers.js";
import {
  collectPublicReadinessDiagnostics,
  runPublicReadinessChecks,
} from "./publicReadinessTestHelpers.js";

const SAMPLE_CONTEXT = {
  title: "IIVO founder notes",
  text: "IIVO is an AI decision engine for founders.",
};

export async function setupMasterQaPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("iivo_onboarding_v1_completed", "true");
  });
  await installNeutralPresetInit(page);
}

export async function sectionBasicAssistant(page: Page, report: MasterQaReport): Promise<void> {
  const id = "basic-assistant";
  const label = "Basic Assistant";
  try {
    await page.goto("/");
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });
    await assertNeutralPresetActive(page);

    await submitComposerPrompt(page, "What is IIVO in one paragraph?");
    await waitForRunComplete(page, {
      status: "Waiting for Direct Answer (What is IIVO)…",
      logPrefix: "Master QA — IIVO intro",
      runWaitTimeoutMs: 4 * 60_000,
    });
    await expectLatestTurnRoute(page, /Direct Answer/i);
    const answer1 = await getLatestTurn(page).getByTestId("final-answer").innerText();
    expect(answer1.toLowerCase()).toMatch(/decision|routing|council|engine|workflow/i);
    expect(answer1).not.toMatch(/AI Front Desk/i);

    await submitComposerPrompt(
      page,
      "Rewrite this to sound professional: I need this done today because we are behind.",
    );
    await waitForRunComplete(page, {
      status: "Waiting for Direct Answer (rewrite)…",
      logPrefix: "Master QA — rewrite",
      runWaitTimeoutMs: 4 * 60_000,
    });
    await expectLatestTurnRoute(page, /Direct Answer/i);
    const answer2 = await getLatestTurn(page).getByTestId("final-answer").innerText();
    expect(answer2.length).toBeGreaterThan(40);
    expect(answer2).not.toMatch(/decision memo|final recommendation:/i);

    await submitComposerPrompt(
      page,
      "Summarize this in one sentence: IIVO routes prompts, tracks decisions, learns from outcomes, and can analyze screenshots.",
    );
    await waitForRunComplete(page, {
      status: "Waiting for Direct Answer (summary)…",
      logPrefix: "Master QA — summary",
      runWaitTimeoutMs: 4 * 60_000,
    });
    const answer3 = await getLatestTurn(page).getByTestId("final-answer").innerText();
    expect(answer3.length).toBeLessThan(800);

    report.pass(id, label, "Direct Answer parity verified (3 prompts)");
  } catch (err) {
    report.fail(id, label, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function sectionContextBridge(page: Page, report: MasterQaReport): Promise<void> {
  const id = "context-bridge";
  const label = "Context Bridge";
  try {
    await page.goto("/");
    await attachPastedContext(page, SAMPLE_CONTEXT.title, SAMPLE_CONTEXT.text);
    const chip = page.getByTestId("context-attachment-chip");
    await expect(chip).toContainText(SAMPLE_CONTEXT.title);
    await expect(chip).toContainText(/User-pasted context/i);
    await expect(chip).toHaveAttribute("data-confidence", "user_pasted");
    await page.getByTestId("context-chip-remove").click();

    const ephemeralTitle = `Master QA ephemeral ${Date.now()}`;
    const evidenceTitle = `Master QA evidence ${Date.now()}`;

    await attachPastedContext(page, ephemeralTitle, SAMPLE_CONTEXT.text);
    await page.reload();
    await page.getByTestId("sidebar-nav-context-library").click();
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
    await pauseQuick(page, 400);

    report.pass(id, label, "Paste, attach, library, contamination guard verified");
  } catch (err) {
    report.fail(id, label, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function sectionLensHandoff(page: Page, report: MasterQaReport): Promise<void> {
  const id = "lens-handoff";
  const label = "Lens Handoff";
  const title = `Master QA Lens ${Date.now()}`;
  let fixtureId = "";
  try {
    fixtureId = await createLensPageContextItem(title);

    await page.goto(`/?lensContextId=${encodeURIComponent(fixtureId)}`);
    await expect(page.getByTestId("context-attachment-chip").filter({ hasText: title })).toBeVisible({
      timeout: 20_000,
    });

    await page.goto(`/?lensAsk=${encodeURIComponent(fixtureId)}`);
    await expect(page.getByTestId("context-attachment-chip").filter({ hasText: title })).toBeVisible({
      timeout: 20_000,
    });
    await expect
      .poll(async () => page.getByTestId("composer-input").inputValue())
      .toMatch(/analyze the context/i);

    await page.goto("/?lensContextId=missing-master-lens-id");
    await expect(page.getByTestId("lens-handoff-error")).toBeVisible({ timeout: 20_000 });

    await page.goto("/?lensAsk=missing-master-lens-id");
    await expect(page.getByTestId("lens-handoff-error")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("sidebar-nav-context-library").click();
    await selectContextLibraryItemByTitle(page, title);
    await expect(page.getByTestId("context-lens-badge-detail")).toContainText(/IIVO Lens/i);

    report.pass(id, label, "Lens handoff + invalid ID banners verified");
  } catch (err) {
    report.fail(id, label, err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    if (fixtureId) await deleteContextItem(fixtureId);
  }
}

export async function sectionScreenshotEvidence(page: Page, report: MasterQaReport): Promise<void> {
  const id = "screenshot-evidence";
  const label = "Screenshot Evidence";
  const title = `Master QA Screenshot ${Date.now()}`;
  let fixtureId = "";
  try {
    fixtureId = await createLensScreenshotItem(title, {
      sourceUrl: "https://www.design.com/",
      contentText: "Logo, Graphic & AI Design | Design.com page capture.",
    });

    await page.goto(`/?lensAsk=${encodeURIComponent(fixtureId)}`);
    await expect(page.getByTestId("context-attachment-chip").filter({ hasText: title })).toBeVisible({
      timeout: 20_000,
    });
    await expect
      .poll(async () => page.getByTestId("composer-input").inputValue())
      .toMatch(/analyze this screenshot/i);

    await page.goto("/");
    await page.getByTestId("sidebar-nav-context-library").click();
    await selectContextLibraryItemByTitle(page, title);
    await expect(page.getByTestId("context-screenshot-preview")).toBeVisible();
    await expect(page.getByTestId("context-lens-badge-detail")).toContainText(/IIVO Lens/i);

    report.pass(id, label, "Screenshot fixture, thumbnail, lensAsk prompt verified");
  } catch (err) {
    report.fail(id, label, err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    if (fixtureId) await deleteContextItem(fixtureId);
  }
}

export async function sectionVisionLive(
  page: Page,
  report: MasterQaReport,
  visionConfigured: boolean,
): Promise<void> {
  const id = "vision-live";
  const label = "Vision Live";
  if (!process.env.VISION_QA_LIVE) {
    report.skip(
      id,
      label,
      report.visionEnabled
        ? "Vision live test skipped — set VISION_QA_LIVE=1 (npm run qa:master:vision-live)."
        : "Vision live test skipped — IMAGE_VISION_ENABLED is false.",
    );
    return;
  }

  if (!visionConfigured) {
    report.fail(
      id,
      label,
      "VISION_QA_LIVE=1 but /api/config/vision reports not configured. Enable IMAGE_VISION_ENABLED and provider key.",
    );
    return;
  }

  const title = `Master QA Vision Live ${Date.now()}`;
  let fixtureId = "";
  try {
    fixtureId = await createLensScreenshotItem(title);
    await page.goto(`/?lensAsk=${encodeURIComponent(fixtureId)}`);
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => page.getByTestId("composer-input").inputValue())
      .toMatch(/analyze this screenshot/i);

    await page.getByTestId("composer-send").click();
    await dismissRunGateModals(page);
    await waitForRunComplete(page, {
      status: "Waiting for live vision analysis…",
      logPrefix: "Master QA — vision live",
      runWaitTimeoutMs: 6 * 60_000,
    });

    await expectLatestTurnRoute(page, /Direct Answer/i);
    const turn = getLatestTurn(page);
    await expect(turn.getByTestId("final-answer")).toBeVisible();

    const detailsBtn = turn.getByTestId("direct-answer-details");
    if (await detailsBtn.isVisible()) {
      await detailsBtn.click();
    }
    const trace = turn.getByTestId("external-context-trace");
    if (await trace.isVisible().catch(() => false)) {
      await expect(trace).toContainText(/Screenshot analyzed visually:\s*yes/i);
    }

    const summary = await fetchUsageSummary();
    report.creditsAfter = summary.currentCredits;

    report.pass(id, label, "Live vision analysis completed", {
      creditsAfter: summary.currentCredits,
    });
  } catch (err) {
    report.fail(id, label, err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    if (fixtureId) await deleteContextItem(fixtureId);
  }
}

export async function sectionVisionMemoryGuard(report: MasterQaReport): Promise<void> {
  const id = "vision-memory-guard";
  const label = "Vision Memory Guard";
  try {
    await runVisionMemoryGuardUnitTest();
    report.pass(id, label, "Server unit test passed (no unrelated memory bleed)");
  } catch (err) {
    report.fail(id, label, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function sectionUsageCredits(page: Page, report: MasterQaReport): Promise<void> {
  const id = "usage-credits";
  const label = "Usage Credits";
  let guardDiagnostics: ReturnType<typeof formatGuardDiagnostics> | undefined;
  try {
    const before = await assertUsageResetToDefault();
    report.creditsBefore = before.currentCredits;

    const directEstimate = await estimateCredits({
      workflowId: "auto",
      tokenMode: "quick",
      benchmarkEnabled: false,
      prompt: "What is IIVO?",
    });
    expect(directEstimate.estimatedCredits).toBe(1);

    const guardResult = await verifyInsufficientCreditsGuard(page, { requireUiBanner: false });
    guardDiagnostics = formatGuardDiagnostics(guardResult);

    const after = await resetLocalCredits();
    report.creditsAfter = after.currentCredits;
    expectCredits(after, 100);

    const passMessage = guardResult.uiWarningVisible
      ? `Credits reset, estimate=1, API + UI guard verified (${guardResult.blockPath})`
      : "API guard confirmed 402 + blocked event; UI banner not observed in this run.";
    if (guardResult.uiWarningNote) {
      report.addNote(guardResult.uiWarningNote);
    }

    report.pass(id, label, passMessage, {
      directEstimateCredits: directEstimate.estimatedCredits,
      insufficientCreditsGuard: guardResult,
    });
  } catch (err) {
    await resetLocalCredits().catch(() => undefined);
    const message = err instanceof Error ? err.message : String(err);
    report.fail(id, label, message, {
      guardDiagnostics: guardDiagnostics ?? "guard check did not complete",
      creditsBefore: report.creditsBefore,
      creditsAfter: (await fetchUsageSummary().catch(() => null))?.currentCredits,
    });
    throw err;
  }
}

export async function sectionDecisionLearning(report: MasterQaReport): Promise<void> {
  const id = "decision-learning";
  const label = "Decision Learning";
  if (!process.env.MASTER_QA_FULL) {
    report.skip(id, label, "Light check only in default master — set MASTER_QA_FULL=1 for UI flow.");
    try {
      const res = await fetch("http://localhost:3001/api/decisions/stats", {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error("Decision stats API failed");
      report.pass(id, label, "Decision Learning API responds (full UI skipped)");
    } catch (err) {
      report.fail(id, label, err instanceof Error ? err.message : String(err));
    }
    return;
  }

  report.skip(id, label, "Full Decision Learning UI flow not yet in MASTER_QA_FULL — API check only.");
}

export async function sectionBenchmarkSanity(page: Page, report: MasterQaReport): Promise<void> {
  const id = "benchmark";
  const label = "Benchmark";
  try {
    await page.goto("/");
    await page.getByTestId("sidebar-nav-benchmark-lab").click();
    await expect(page.getByTestId("benchmark-lab-panel")).toBeVisible();
    await expect(page.getByTestId("benchmark-prompt-library")).toBeVisible();

    await page.getByTestId("benchmark-library-category-filter").selectOption("IIVO Positioning");
    await expect(page.getByTestId("benchmark-library-item-simple-iivo-explanation")).toBeVisible();
    await page.getByTestId("benchmark-select-prompt-simple-iivo-explanation").click();
    await expect(page.getByTestId("benchmark-prompt-input")).toHaveValue(/What is IIVO/i);

    if (process.env.BENCHMARK_QA_LIVE === "1") {
      report.addNote("BENCHMARK_QA_LIVE=1 — run npm run qa:benchmark for full live benchmark.");
    }

    report.pass(id, label, "Benchmark Lab UI + Simple IIVO prompt selectable");
  } catch (err) {
    report.fail(id, label, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function sectionPublicReadiness(page: Page, report: MasterQaReport): Promise<void> {
  const id = "public-readiness";
  const label = "Public Readiness";
  let failedLocator: string | undefined;
  try {
    await runPublicReadinessChecks(page);
    report.pass(id, label, "Landing, composer, Trust & Privacy, Usage & Credits, checklist verified");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failedLocator = message.includes("getByRole")
      ? "heading IIVO level 1"
      : message.includes("composer-input")
        ? "composer-input"
        : message.includes("trust")
          ? "sidebar-nav-trust / Trust panel"
          : message.includes("usage-credits")
            ? "usage-credits-panel"
            : message.includes("readiness-checklist")
              ? "public-readiness-checklist"
              : message.slice(0, 120);
    const diagnostics = await collectPublicReadinessDiagnostics(page, failedLocator);
    qaLog(`[Public Readiness] diagnostics: ${JSON.stringify(diagnostics)}`);
    report.fail(id, label, message, { publicReadiness: diagnostics });
    throw err;
  }
}

export async function runMasterQaMonitorSections(
  page: Page,
  report: MasterQaReport,
  visionConfigured: boolean,
): Promise<void> {
  const checks = [
    "Environment",
    "Basic Assistant",
    "Context Bridge",
    "Lens Handoff",
    "Screenshot Evidence",
    "Vision Live",
    "Vision Memory Guard",
    "Usage Credits",
    "Decision Learning",
    "Benchmark",
    "Public Readiness",
  ];

  await initQaMonitor(page, {
    title: "IIVO Master QA",
    initialStep: "Starting qualification flow",
    initialStatus: "Running sections A–L",
  });
  await updateQaMonitor(page, {
    checks: checks.map((label) => ({ label, state: "pending" as const })),
  });

  const runSection = async (
    label: string,
    fn: () => Promise<void>,
  ): Promise<void> => {
    await markQaCheck(page, label, "active");
    await updateQaMonitor(page, { step: label, status: `Running ${label}…` });
    try {
      await fn();
      await markQaCheck(page, label, "pass");
    } catch {
      await markQaCheck(page, label, "fail");
      throw new Error(`${label} failed`);
    }
  };

  await runSection("Environment", async () => {
    const env = report.sections.find((s) => s.id === "environment");
    if (env?.status === "fail") {
      throw new Error(env.error ?? "Environment health check failed");
    }
  });

  await runSection("Basic Assistant", () => sectionBasicAssistant(page, report));
  await runSection("Context Bridge", () => sectionContextBridge(page, report));
  await runSection("Lens Handoff", () => sectionLensHandoff(page, report));
  await runSection("Screenshot Evidence", () => sectionScreenshotEvidence(page, report));
  await runSection("Vision Live", () => sectionVisionLive(page, report, visionConfigured));
  await runSection("Vision Memory Guard", () => sectionVisionMemoryGuard(report));
  await runSection("Usage Credits", () => sectionUsageCredits(page, report));
  await runSection("Decision Learning", () => sectionDecisionLearning(report));
  await runSection("Benchmark", () => sectionBenchmarkSanity(page, report));
  await runSection("Public Readiness", () => sectionPublicReadiness(page, report));

  await showQaSuccess(page, checks, {
    statusMessage: report.hasFailures() ? "Master QA completed with failures" : "Master QA passed",
  });
}
