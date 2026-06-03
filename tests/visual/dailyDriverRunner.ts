/**
 * Daily Driver scenario execution + friction scoring + Agent Mind narration.
 */

import { expect, type Page } from "@playwright/test";
import type { DailyDriverScenario } from "./dailyDriverScenarios.js";
import { isDailyQaLive } from "./dailyDriverScenarios.js";
import type { DailyDriverAgentMind, AgentEvaluationSummary } from "./dailyDriverAgentMind.js";
import type { DailyDriverReport, FrictionKind, ScenarioResult } from "./dailyDriverReport.js";
import { attachPastedContext } from "./contextBridgeTestHelpers.js";
import {
  createLensPageContextItem,
  createLensScreenshotItem,
  deleteContextItem,
} from "./masterQaFixtures.js";
import { runVisionMemoryGuardUnitTest } from "./masterQaVisionGuard.js";
import { preparePublicReadinessState } from "./publicReadinessTestHelpers.js";
import { isWatchMode, pauseMs } from "./qaEnv.js";
import {
  getLatestTurn,
  openComposerConfigure,
  selectPillOption,
  SubmitNotFiredError,
  submitComposerPromptRobust,
} from "./qaStepHelpers.js";
import { waitForRunComplete } from "./runWaitHelpers.js";
import {
  assertComposerReadyForRun,
  assertNeutralPresetConfigured,
  selectWorkspacePreset,
} from "./qaPresetHelpers.js";
import { scoreScenarioFriction } from "./dailyDriverAutoDetect.js";
import { ensureDailyDriverQaMonitor } from "./dailyDriverQaMonitor.js";
import { updateQaMonitor } from "./qaMonitor.js";

async function runPromptScenario(
  page: Page,
  scenario: DailyDriverScenario,
  agent: DailyDriverAgentMind,
): Promise<{
  answer: string;
  routeText: string;
  skippedLive: boolean;
}> {
  if (scenario.workflow === "product-decision") {
    await agent.action(scenario, "Opening Configure — Quick response depth for council run.");
    await openComposerConfigure(page);
    await selectPillOption(page, "token-mode-select", "Quick");
  }

  await agent.action(scenario, "Typing prompt into composer…");
  await agent.action(scenario, "Submitting prompt…");
  await submitComposerPromptRobust(page, scenario.prompt, {
    onRetryNarration: (msg) => agent.warn(scenario, msg),
  });
  await agent.observe(scenario, "Submit succeeded — waiting for IIVO response.");

  if (process.env.DAILY_QA_SKIP_LIVE === "1") {
    await agent.warn(scenario, "DAILY_QA_SKIP_LIVE=1 — skipping live provider call.");
    return { answer: "", routeText: "(skipped live)", skippedLive: true };
  }

  await agent.waiting(scenario, "Waiting for IIVO response…");
  await waitForRunComplete(page, {
    status: `Daily Driver — ${scenario.id}`,
    logPrefix: `Daily Driver ${scenario.id}`,
    runWaitTimeoutMs: scenario.maxSeconds * 1000,
    onWaitPoll: async (elapsedSec, diagnostics) => {
      await agent.waiting(
        scenario,
        `Still waiting (${elapsedSec}s) — route: ${diagnostics.routeText.slice(0, 60)}; stop visible: ${diagnostics.stopButtonVisible}`,
        {
          elapsedSec,
          runStatus: diagnostics.runStatusAttr,
          stopVisible: diagnostics.stopButtonVisible,
        },
      );
    },
  });

  const turn = getLatestTurn(page);
  const answer = await turn.getByTestId("final-answer").innerText().catch(() => "");
  const artifactRenderer = turn.getByTestId("artifact-renderer");
  const hasArtifact = await artifactRenderer.isVisible().catch(() => false);
  const artifactType = hasArtifact
    ? await artifactRenderer.getAttribute("data-artifact-type")
    : null;
  const routeLocator = turn.locator('[data-testid="router-status"], [data-testid="workflow-status"]');
  const routeText =
    (await routeLocator.count()) > 0
      ? (await routeLocator.last().innerText()).replace(/\s+/g, " ").trim()
      : "";

  const execTrace = turn.getByTestId("execution-mode-trace");
  let effectiveExecutionMode: string | undefined;
  let executionModeReason: string | undefined;
  let selectedExecutionMode: string | undefined;
  if ((await execTrace.count()) > 0) {
    const traceText = await execTrace.innerText();
    const selectedMatch = traceText.match(/Selected:\s*([^\n]+)/i);
    const effectiveMatch = traceText.match(/Effective:\s*([^\n]+)/i);
    selectedExecutionMode = selectedMatch?.[1]?.trim();
    effectiveExecutionMode = effectiveMatch?.[1]?.trim();
    const reasonLine = traceText.split("\n").find((l) => l.trim() && !/Selected:|Effective:|Confirmation/i.test(l));
    executionModeReason = reasonLine?.trim();
  }

  await agent.observe(
    scenario,
    `Answer received (${answer.length} chars). Route: ${routeText || "unknown"}.` +
      (selectedExecutionMode && effectiveExecutionMode
        ? ` Selected Mode: ${selectedExecutionMode}. Effective Mode: ${effectiveExecutionMode}${executionModeReason ? ` — ${executionModeReason}` : "."}`
        : ""),
    { answerLength: answer.length, routeText, selectedExecutionMode, effectiveExecutionMode },
  );

  return {
    answer,
    routeText,
    skippedLive: false,
    hasArtifact,
    artifactType,
    effectiveExecutionMode,
  };
}

function resolveOutcome(
  frictions: FrictionKind[],
  requiredMissed: string[],
  forbiddenHit: string[],
  outcome: ScenarioResult["outcome"],
  scenario: DailyDriverScenario,
): ScenarioResult["outcome"] {
  if (outcome === "skipped") return "skipped";
  if (
    frictions.includes("memory_bleed") ||
    frictions.includes("self_reference_bleed") ||
    (forbiddenHit.length > 0 && !frictions.includes("useful_answer"))
  ) {
    const outcomeBleed =
      forbiddenHit.some((h) => /past outcome|AI Front Desk domain/i.test(h)) &&
      scenario.audience === "general" &&
      !scenario.preset;
    if (outcomeBleed && scenario.failureSeverity === "blocker") {
      return "fail";
    }
    return frictions.includes("useful_answer") ? "pass_with_friction" : "fail";
  }
  if (requiredMissed.length > 0 && !frictions.includes("useful_answer")) {
    return "pass_with_friction";
  }
  if (
    frictions.includes("generic_answer") ||
    frictions.includes("worse_than_chatgpt") ||
    frictions.includes("context_ignored")
  ) {
    return "pass_with_friction";
  }
  if (
    frictions.includes("technical_fail") ||
    frictions.includes("submit_not_fired") ||
    frictions.includes("wrong_route") ||
    frictions.includes("over_routed") ||
    frictions.includes("contract_violation") ||
    frictions.includes("deliverable_not_first") ||
    frictions.includes("wrong_output_format")
  ) {
    return "fail";
  }
  if (frictions.includes("useful_answer")) {
    return frictions.length > 1 ? "pass_with_friction" : "pass";
  }
  return scenario.kind !== "prompt_run" ? "pass" : "pass_with_friction";
}

export async function runDailyDriverScenario(
  page: Page,
  scenario: DailyDriverScenario,
  report: DailyDriverReport,
  agent: DailyDriverAgentMind,
  scenarioIndex: number,
  scenarioTotal: number,
): Promise<void> {
  const started = Date.now();
  const frictions: FrictionKind[] = [];
  const frictionNotes: string[] = [];
  let outcome: ScenarioResult["outcome"] = "pass";
  let answerPreview = "";
  let answerFull = "";
  let routeText = "";
  let error: string | undefined;
  const requiredMissed: string[] = [];
  const forbiddenHit: string[] = [];
  let fixtureIds: string[] = [];
  let contextUsed: boolean | undefined;
  let lastScore: ReturnType<typeof scoreScenarioFriction> | undefined;
  let promptArtifactType: string | null = null;
  let promptHasArtifact = false;
  let promptEffectiveExecutionMode: string | undefined;

  agent.setRunBounds(scenarioIndex, scenarioTotal);
  await agent.planScenario(scenario);
  await updateQaMonitor(page, {
    step: `Scenario ${scenarioIndex}/${scenarioTotal}`,
    status: scenario.title,
  });

  try {
    await agent.action(scenario, "Preparing neutral landing state (no preset contamination).");
    await preparePublicReadinessState(page);
    await ensureDailyDriverQaMonitor(page, { totalScenarios: scenarioTotal });
    await assertComposerReadyForRun(page);
    await assertNeutralPresetConfigured(page);
    await agent.observe(scenario, "Neutral preset confirmed in Configure — No preset active.");

    if (scenario.preset === "ai-front-desk-sales-test") {
      await agent.action(scenario, "Selecting AI Front Desk Sales Test preset (explicit opt-in).");
      await selectWorkspacePreset(page, "AI Front Desk Sales Test");
    }

    switch (scenario.kind) {
      case "benchmark_ui": {
        await agent.action(scenario, "Opening Benchmark Lab panel.");
        await page.getByTestId("sidebar-nav-benchmark-lab").click();
        await expect(page.getByTestId("benchmark-lab-panel")).toBeVisible();
        await expect(page.getByTestId("benchmark-prompt-input")).toBeVisible();
        const libItem = page.getByTestId("benchmark-library-item-simple-iivo-explanation");
        if (await libItem.isVisible().catch(() => false)) {
          await page.getByTestId("benchmark-select-prompt-simple-iivo-explanation").click();
        }
        answerPreview = await page.getByTestId("benchmark-prompt-input").inputValue();
        routeText = "benchmark_ui";
        frictions.push("useful_answer");
        await agent.observe(scenario, "Benchmark Lab UI reachable; prompt field populated.");
        break;
      }

      case "lens_invalid": {
        await agent.action(scenario, "Opening invalid Lens handoff URL.");
        await page.goto("/?lensAsk=missing-daily-driver-lens-id");
        await expect(page.getByTestId("lens-handoff-error")).toBeVisible({ timeout: 15_000 });
        answerPreview = await page.getByTestId("lens-handoff-error").innerText();
        routeText = "lens_error";
        for (const re of scenario.requiredSignals) {
          if (!re.test(answerPreview)) requiredMissed.push(re.source);
        }
        await agent.observe(scenario, `Lens error message shown (${answerPreview.length} chars).`);
        break;
      }

      case "memory_guard_unit": {
        await agent.action(scenario, "Running server-side vision memory guard unit test (no UI provider call).");
        await runVisionMemoryGuardUnitTest();
        answerPreview = "visionMemoryGuard unit test passed";
        routeText = "server_unit";
        frictions.push("useful_answer");
        await agent.observe(scenario, "Server memory guard unit test passed.");
        break;
      }

      case "lens_handoff": {
        const title = scenario.lensPageTitle ?? `Daily Driver Lens ${Date.now()}`;
        await agent.action(scenario, `Creating Lens page fixture: ${title}`);
        const id = await createLensPageContextItem(title);
        fixtureIds.push(id);
        if (scenario.lensPageContent) {
          await fetch(`http://localhost:3001/api/context/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contentText: scenario.lensPageContent }),
          }).catch(() => undefined);
        }
        await page.goto(`/?lensAsk=${encodeURIComponent(id)}`);
        await ensureDailyDriverQaMonitor(page, { totalScenarios: scenarioTotal, report });
        await expect(page.getByTestId("context-attachment-chip").filter({ hasText: title })).toBeVisible({
          timeout: 20_000,
        });
        if (scenario.liveProviderRequired && isDailyQaLive()) {
          await agent.action(scenario, "Lens handoff ready — submitting prompt for live answer.");
          await page.getByTestId("composer-send").click();
          const result = await runPromptScenario(page, { ...scenario, prompt: scenario.prompt }, agent);
          answerPreview = result.answer.slice(0, 400);
          routeText = result.routeText;
        } else {
          answerPreview = await page.getByTestId("composer-input").inputValue();
          routeText = "lens_handoff_setup";
          frictions.push("useful_answer");
          frictionNotes.push("Lens handoff verified; live answer skipped (use DAILY_QA_LIVE=1)");
          await agent.observe(scenario, "Lens handoff chip visible; live answer skipped in default mode.");
        }
        break;
      }

      case "screenshot_handoff": {
        const title = scenario.screenshotTitle ?? `Daily Driver shot ${Date.now()}`;
        await agent.action(scenario, `Creating screenshot fixture: ${title}`);
        const id = await createLensScreenshotItem(title, {
          sourceUrl: scenario.screenshotSourceUrl,
          contentText: scenario.screenshotContent,
        });
        fixtureIds.push(id);
        await page.goto(`/?lensAsk=${encodeURIComponent(id)}`);
        await ensureDailyDriverQaMonitor(page, { totalScenarios: scenarioTotal, report });
        await expect(page.getByTestId("context-attachment-chip").filter({ hasText: title })).toBeVisible({
          timeout: 20_000,
        });
        await expect
          .poll(async () => page.getByTestId("composer-input").inputValue())
          .toMatch(/analyze this screenshot/i);
        await agent.observe(scenario, "Screenshot attached; composer prefilled with analyze prompt.");

        if (scenario.liveVisionRequired && isDailyQaLive()) {
          await agent.action(scenario, "Live vision enabled — submitting screenshot analysis.");
          await page.getByTestId("composer-send").click();
          const result = await runPromptScenario(page, scenario, agent);
          answerPreview = result.answer.slice(0, 400);
          routeText = result.routeText;
        } else {
          answerPreview = await page.getByTestId("composer-input").inputValue();
          routeText = "screenshot_handoff_setup";
          frictions.push("useful_answer");
          frictionNotes.push("Screenshot handoff verified; live vision skipped");
          await agent.observe(scenario, "Screenshot handoff OK — no live vision in default mode.");
        }
        break;
      }

      case "context_attach_run": {
        const fx = scenario.contextFixture!;
        await agent.action(scenario, `Attaching context: ${fx.title}`);
        await attachPastedContext(page, fx.title, fx.text);
        await expect(page.getByTestId("context-attachment-chip")).toContainText(fx.title);
        await agent.observe(scenario, "Context chip visible on composer.");
        const result = await runPromptScenario(page, scenario, agent);
        if (result.skippedLive) {
          frictions.push("skipped_live");
          outcome = "skipped";
        } else {
          lastScore = scoreScenarioFriction(scenario, result.answer, result.routeText);
          frictions.push(...lastScore.frictions);
          frictionNotes.push(...lastScore.notes);
          requiredMissed.push(...lastScore.requiredMissed);
          forbiddenHit.push(...lastScore.forbiddenHit);
          contextUsed = /context|attached|based on/i.test(result.answer);
          answerPreview = result.answer.slice(0, 400);
          routeText = result.routeText;
        }
        break;
      }

      case "outcome_flow": {
        if (!isDailyQaLive()) {
          outcome = "skipped";
          frictions.push("skipped_live");
          frictionNotes.push("Outcome flow requires DAILY_QA_LIVE=1");
          await agent.warn(scenario, "Outcome flow skipped — requires DAILY_QA_LIVE=1.");
          break;
        }
        await agent.action(scenario, "Outcome flow — Auto execution mode (live only).");
        await submitComposerPromptRobust(page, scenario.prompt);
        await waitForRunComplete(page, {
          status: "Outcome Product Decision",
          logPrefix: "Daily Driver outcome PD",
          runWaitTimeoutMs: scenario.maxSeconds * 1000,
        });
        answerPreview = await getLatestTurn(page).getByTestId("final-answer").innerText();
        routeText = "product_decision";
        frictions.push("useful_answer");
        break;
      }

      case "prompt_run":
      default: {
        const result = await runPromptScenario(page, scenario, agent);
        if (result.skippedLive) {
          outcome = "skipped";
          frictions.push("skipped_live");
        } else {
          answerFull = result.answer;
          answerPreview = result.answer.slice(0, 400);
          routeText = result.routeText;
          promptArtifactType = result.artifactType ?? null;
          promptHasArtifact = result.hasArtifact ?? false;
          promptEffectiveExecutionMode = result.effectiveExecutionMode;
        }
        break;
      }
    }

    const durationMs = Date.now() - started;

    if (scenario.kind === "prompt_run" && answerFull && routeText && !frictions.includes("skipped_live")) {
      lastScore = scoreScenarioFriction(scenario, answerFull, routeText, {
        durationMs,
        artifactType: promptArtifactType,
        hasArtifact: promptHasArtifact,
        effectiveExecutionMode: promptEffectiveExecutionMode,
      });
      frictions.push(...lastScore.frictions);
      frictionNotes.push(...lastScore.notes);
      requiredMissed.push(...lastScore.requiredMissed);
      forbiddenHit.push(...lastScore.forbiddenHit);
    }
    if (durationMs > scenario.maxSeconds * 1000) {
      frictions.push("too_slow");
      frictionNotes.push(`Exceeded ${scenario.maxSeconds}s budget`);
    }

    const uniqueFrictions = [...new Set(frictions)];
    outcome = resolveOutcome(uniqueFrictions, requiredMissed, forbiddenHit, outcome, scenario);

    if (scenario.failureSeverity === "blocker" && outcome === "fail") {
      throw new Error(`Blocker scenario failed: ${scenario.id}`);
    }

    const evalSummary: AgentEvaluationSummary = {
      routeText,
      answerLength: answerPreview.length,
      routeOk: lastScore?.routeOk ?? !uniqueFrictions.includes("wrong_route"),
      requiredMissed,
      forbiddenHit,
      frictions: uniqueFrictions,
      frictionNotes,
      agentMessages: lastScore?.agentMessages ?? [],
      autoIssues: lastScore?.autoIssues ?? [],
      contextUsed,
      durationMs,
    };
    await agent.finishScenario(scenario, evalSummary, outcome);
  } catch (err) {
    outcome = "fail";
    error = err instanceof Error ? err.message : String(err);
    if (err instanceof SubmitNotFiredError) {
      frictions.push("submit_not_fired");
      const d = err.diagnostics;
      frictionNotes.push(
        `submit_not_fired: turns ${d.turnsBefore}→${d.turnsAfter}, sendEnabled=${d.sendEnabled}, retried=${d.retried}, url=${d.url}`,
      );
      await agent.friction(scenario, "blocker", error);
    } else {
      frictions.push("technical_fail");
      await agent.friction(scenario, "blocker", error);
    }
    await agent.fail(scenario, error);
  } finally {
    for (const id of fixtureIds) {
      await deleteContextItem(id).catch(() => undefined);
    }

    report.add({
      id: scenario.id,
      title: scenario.title,
      category: scenario.category,
      audience: scenario.audience,
      tags: scenario.tags,
      outcome,
      route: routeText,
      durationMs: Date.now() - started,
      frictions: [...new Set(frictions)],
      frictionNotes,
      requiredMissed,
      forbiddenHit,
      answerPreview,
      error,
    });

    if (isWatchMode() && outcome !== "fail") {
      await page.waitForTimeout(pauseMs(800));
    }
  }

  if (outcome === "fail") {
    throw new Error(error ?? `Daily Driver scenario failed: ${scenario.id}`);
  }
}
