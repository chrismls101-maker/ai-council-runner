/**
 * Aletheia Computer Operator Runner — capture, execute, verify, repeat.
 *
 * USE THIS when: the task requires looking at the current screen state to decide what to do.
 * Closed loop: capture screen + AX/OmniParser grounding → LLM picks one action (strict schema)
 * → execute via aletheiaComputerUseExecutor → verify before/after UI state → repeat until done.
 * Requires explicit user session grant with bounded scope (app, allowed actions, step budget).
 *
 * DO NOT USE THIS for single deterministic actions Aletheia already knows how to execute.
 * For those, use AletheiaActionOrchestrator (aletheiaActionOrchestrator.ts) — no loop overhead,
 * no screen capture, no grounding required.
 *
 * Both pipelines share the same bottom-level executor (glassActions.ts / injectKeystrokes).
 * The distinction is: orchestrator = "I know the answer, execute it";
 *                     operator loop = "look at the screen and figure it out".
 */

import { randomUUID } from "node:crypto";
import { screen } from "electron";
import {
  ALETHEIA_GHOST_CLICK_MS,
  ALETHEIA_GHOST_PRE_CLICK_MS,
  globalScreenToOverlayViewport,
  type AletheiaGhostCursorState,
} from "../shared/aletheiaGhostCursor.ts";
import type { GlassConfig } from "../shared/config.ts";
import type { ActionConfirmation, ActionIntent, PipelineStage } from "../shared/aletheiaExecution.ts";
import { validateActionScope } from "../shared/aletheiaAuthorityGate.ts";
import { planFromNaturalLanguage } from "../shared/aletheiaConversationPlanner.ts";
import { mergeGroundedUiState, findCandidateById } from "../shared/aletheiaGroundedUiState.ts";
import {
  isOperatorStepSuccessful,
  verifyOperatorAction,
} from "../shared/aletheiaActionVerifier.ts";
import {
  buildSessionGrantFromPlan,
  grantComputerOperatorSession,
  isOperatorActionAllowedByGrant,
  isSessionGrantActive,
} from "../shared/aletheiaComputerSessionAuthority.ts";
import {
  appendComputerOperatorAudit,
  finalizeComputerOperatorSnapshot,
  initialComputerOperatorSnapshot,
  narrateOperatorStep,
  COMPUTER_OPERATOR_PLACEHOLDER_GOAL,
  type AletheiaComputerOperatorSnapshot,
  type ComputerOperatorEntrySurface,
  type OperatorAction,
  type OperatorStepDecision,
} from "../shared/aletheiaComputerOperatorLoop.ts";
import type { GroundedUiState } from "../shared/aletheiaGroundedUiState.ts";
import { resolveMarkToScreenRect } from "../shared/companionGuidance.ts";
import { APPLESCRIPT_CAPABLE_APPS } from "../shared/aletheiaComputerUseRouter.ts";
import { captureDisplayById } from "./capture.ts";
import { buildCompanionLocalUiMap } from "./companionUiMapBuilder.ts";
import { tryOmniParserMarks, shouldTryOmniParser } from "./companionOmniParser.ts";
import { executeComputerUse } from "./aletheiaComputerUseExecutor.ts";
import { appendActionLedgerEntry } from "./aletheiaActionLedgerStore.ts";
import { getCachedWindowContext, refreshWindowContext } from "./windowContext.ts";
import { getConnectedDisplays } from "./windows.ts";
import {
  finishAletheiaCompanionOperation,
  isAletheiaCompanionOperationAborted,
  startAletheiaCompanionOperation,
} from "./aletheiaCompanionOperation.ts";
import { askIivoGlass } from "./glassAskClient.ts";
import { optimizeVisualAskImage } from "./visualImageOptimizer.ts";
import { resolveAnthropicApiKey } from "./anthropicKeyStore.ts";
import { resolveOperatorStepDecision, auditRowsToStepHistory } from "./aletheiaComputerOperatorPolicy.ts";
import type { AletheiaDisplayAwarenessSnapshot } from "../shared/aletheiaDisplayAwareness.ts";

const READ_REGION_PROMPT =
  "Summarize the main visible content on screen in 2-4 sentences. Focus on unread messages, threads, or the user's likely goal.";

const BROWSER_APPS = [
  "Google Chrome",
  "Safari",
  "Arc",
  "Brave Browser",
  "Microsoft Edge",
  "Firefox",
  "Chromium",
];

type CaptureBundle = { state: GroundedUiState; imageDataUrl?: string };

export type GrantAndRunResult = { ok: true } | { ok: false; reason: string };

/** Prevents overlapping operator loops and supports cooperative cancel. */
let activeComputerOperatorRunId: string | null = null;
let computerOperatorCancelRequested = false;

const COMPUTER_OPERATOR_CANCEL_SUMMARY = "Computer operator cancelled.";

export function isAletheiaComputerOperatorRunning(): boolean {
  return activeComputerOperatorRunId != null;
}

export function requestAletheiaComputerOperatorCancel(): void {
  computerOperatorCancelRequested = true;
}

export function resetAletheiaComputerOperatorCancel(): void {
  computerOperatorCancelRequested = false;
}

function shouldStopComputerOperator(host: AletheiaComputerOperatorHost): boolean {
  if (computerOperatorCancelRequested || host.shouldCancel?.()) return true;
  const phase = host.getSnapshot()?.phase;
  return phase === "failed" || phase === "complete";
}

function isOperatorStopRequested(
  host: AletheiaComputerOperatorHost,
  signal?: AbortSignal,
): boolean {
  return (
    shouldStopComputerOperator(host)
    || isAletheiaCompanionOperationAborted(signal)
    || signal?.aborted === true
  );
}

function finalizeComputerOperatorCancelled(
  host: AletheiaComputerOperatorHost,
  snapshot: AletheiaComputerOperatorSnapshot,
  summary = COMPUTER_OPERATOR_CANCEL_SUMMARY,
): AletheiaComputerOperatorSnapshot {
  const phase = host.getSnapshot()?.phase;
  if (phase === "complete" || phase === "failed") {
    return snapshot;
  }
  const finalized = finalizeComputerOperatorSnapshot(snapshot, {
    ok: false,
    summary,
    phase: "failed",
  });
  setSnapshot(host, finalized);
  host.onComplete?.(summary, false);
  return finalized;
}

function stopIfRequested(
  host: AletheiaComputerOperatorHost,
  snapshot: AletheiaComputerOperatorSnapshot,
  signal?: AbortSignal,
  summary = COMPUTER_OPERATOR_CANCEL_SUMMARY,
): boolean {
  if (!isOperatorStopRequested(host, signal)) return false;
  finalizeComputerOperatorCancelled(host, snapshot, summary);
  return true;
}

async function captureGroundedUiStateOrFail(
  host: AletheiaComputerOperatorHost,
  snapshot: AletheiaComputerOperatorSnapshot,
  signal: AbortSignal | undefined,
  bundle: CaptureBundle | null,
): Promise<CaptureBundle | null> {
  try {
    return bundle ?? await captureGroundedUiState(host, signal);
  } catch (err) {
    if (isOperatorStopRequested(host, signal)) {
      finalizeComputerOperatorCancelled(host, snapshot, "Cancelled during capture.");
    } else {
      const message = `Screen capture failed: ${err instanceof Error ? err.message : String(err)}`;
      const finalized = finalizeComputerOperatorSnapshot(snapshot, {
        ok: false,
        summary: message,
        phase: "failed",
      });
      setSnapshot(host, finalized);
      host.onComplete?.(message, false);
    }
    return null;
  }
}

export interface AletheiaComputerOperatorHost {
  getSnapshot: () => AletheiaComputerOperatorSnapshot | undefined;
  setSnapshot: (snapshot: AletheiaComputerOperatorSnapshot | undefined) => void;
  push: () => void;
  getSessionId: () => string;
  getConfig: () => GlassConfig;
  resolveCaptureTarget: () => { id: number; label: string };
  getDisplayAwareness?: () => AletheiaDisplayAwarenessSnapshot | undefined;
  getOverlayBounds?: () => { x: number; y: number; width: number; height: number };
  getLedgerAttribution?: () => string | undefined;
  getWindowContext?: () => { appName?: string; windowTitle?: string };
  getScreenDigest?: () => string | undefined;
  shouldCancel?: () => boolean;
  onComplete?: (summary: string, ok: boolean) => void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setSnapshot(
  host: AletheiaComputerOperatorHost,
  snapshot: AletheiaComputerOperatorSnapshot,
): void {
  host.setSnapshot(snapshot);
  host.push();
}

function clearOperatorGhostCursor(
  host: AletheiaComputerOperatorHost,
  snapshot: AletheiaComputerOperatorSnapshot,
): AletheiaComputerOperatorSnapshot {
  if (!snapshot.ghostCursor) return snapshot;
  const next = { ...snapshot, ghostCursor: undefined, updatedAt: Date.now() };
  setSnapshot(host, next);
  return next;
}

async function showOperatorGhostBeforeClick(
  host: AletheiaComputerOperatorHost,
  snapshot: AletheiaComputerOperatorSnapshot,
  before: GroundedUiState,
  targetId: string | undefined,
): Promise<AletheiaComputerOperatorSnapshot> {
  const coords = resolveClickCoordinates(before, host, targetId);
  const overlayBounds = host.getOverlayBounds?.();
  if (!coords || !overlayBounds) return snapshot;

  const viewport = globalScreenToOverlayViewport(coords.clickX, coords.clickY, overlayBounds);
  const approach: AletheiaGhostCursorState = {
    x: viewport.x,
    y: viewport.y,
    phase: "approach",
  };
  let next = { ...snapshot, ghostCursor: approach, updatedAt: Date.now() };
  setSnapshot(host, next);
  await delay(ALETHEIA_GHOST_PRE_CLICK_MS);

  next = {
    ...next,
    ghostCursor: { ...approach, phase: "click" },
    updatedAt: Date.now(),
  };
  setSnapshot(host, next);
  await delay(ALETHEIA_GHOST_CLICK_MS);
  return next;
}

function resolveBrowserApp(targetApps: string[], activeApp?: string): string {
  for (const app of targetApps) {
    const match = BROWSER_APPS.find(
      (browser) => browser.toLowerCase() === app.toLowerCase()
        || app.toLowerCase().includes(browser.toLowerCase()),
    );
    if (match) return match;
  }
  if (activeApp) {
    const front = BROWSER_APPS.find(
      (browser) => activeApp.toLowerCase().includes(browser.toLowerCase()),
    );
    if (front) return front;
  }
  for (const browser of BROWSER_APPS) {
    if (APPLESCRIPT_CAPABLE_APPS.has(browser)) return browser;
  }
  return "Safari";
}

function buildReadRegionFallback(host: AletheiaComputerOperatorHost, state: GroundedUiState): string {
  const ctx = host.getWindowContext?.() ?? {};
  const digest = host.getScreenDigest?.()?.trim();
  const labels = state.candidates
    .slice(0, 8)
    .map((c) => c.label)
    .filter((label) => label.length > 2)
    .join(", ");
  return [
    `Front app: ${ctx.appName ?? state.activeApp ?? "unknown"}.`,
    ctx.windowTitle ? `Window: ${ctx.windowTitle}.` : "",
    labels ? `Visible controls: ${labels}.` : "",
    digest ? `Screen digest: ${digest.slice(0, 400)}.` : "",
    "Vision read unavailable — this is a best-effort structural summary from accessibility and digest signals.",
  ]
    .filter(Boolean)
    .join(" ");
}

function operatorIntent(sessionId: string, snapshot: AletheiaComputerOperatorSnapshot): ActionIntent {
  return {
    id: randomUUID(),
    sessionId,
    kind: "delegated",
    summary: `Computer operator — ${snapshot.plan.goal.slice(0, 72)}`,
    rationale: snapshot.plan.goal,
    scope: {
      description: snapshot.plan.scope,
      targetApp: snapshot.plan.targetApps[0],
    },
    payload: {
      computerOperatorLoopId: snapshot.loopId,
      goal: snapshot.plan.goal,
    },
    requestedAt: Date.now(),
  };
}

function sessionConfirmation(
  intent: ActionIntent,
  grantedBy: string,
): ActionConfirmation {
  return {
    intentId: intent.id,
    confirmedAt: Date.now(),
    confirmedBy: grantedBy === "session-l3" ? "user-voice" : "user-tap",
  };
}

function recordLedger(
  intent: ActionIntent,
  stage: PipelineStage,
  narration: string,
  ok: boolean | null,
  attribution?: string | null,
  errorMessage?: string | null,
): void {
  appendActionLedgerEntry({
    intent,
    stage,
    narration,
    ok,
    errorMessage: errorMessage ?? null,
    attribution,
  });
}

function resolveClickCoordinates(
  before: GroundedUiState,
  host: AletheiaComputerOperatorHost,
  candidateId: string | undefined,
): { clickX: number; clickY: number; label: string } | null {
  const candidate = findCandidateById(before, candidateId);
  if (!candidate) return null;

  const rect = resolveMarkToScreenRect(
    {
      id: candidate.id,
      bounds: candidate.bounds,
      source: candidate.source === "screenshot" ? "vision" : candidate.source,
    },
    { width: before.width, height: before.height },
  );
  const captureTarget = host.resolveCaptureTarget();
  const display =
    getConnectedDisplays().find((d) => d.id === captureTarget.id)
    ?? screen.getAllDisplays().find((d) => d.id === captureTarget.id)
    ?? screen.getPrimaryDisplay();

  return {
    clickX: display.bounds.x + rect.left + rect.width / 2,
    clickY: display.bounds.y + rect.top + rect.height / 2,
    label: candidate.label,
  };
}

async function captureGroundedUiState(
  host: AletheiaComputerOperatorHost,
  signal?: AbortSignal,
): Promise<CaptureBundle> {
  if (signal?.aborted) throw new Error("Computer operator aborted.");

  await refreshWindowContext();
  const ctx = getCachedWindowContext();
  const captureTarget = host.resolveCaptureTarget();
  const shot = await captureDisplayById(captureTarget.id, captureTarget.label);
  const display =
    getConnectedDisplays().find((d) => d.id === captureTarget.id)
    ?? screen.getAllDisplays().find((d) => d.id === captureTarget.id);

  const captureId = `operator-${Date.now()}`;
  let uiMap = await buildCompanionLocalUiMap({
    captureId,
    captureWidth: shot.width,
    captureHeight: shot.height,
    displayOrigin: display ? { x: display.bounds.x, y: display.bounds.y } : undefined,
  });

  if (
    shot.imageDataUrl
    && shouldTryOmniParser(uiMap?.marks.length ?? 0, ctx.appName)
  ) {
    const omniMarks = await tryOmniParserMarks({
      imageDataUrl: shot.imageDataUrl,
      captureWidth: shot.width,
      captureHeight: shot.height,
    });
    if (omniMarks.length) {
      uiMap = uiMap
        ? { ...uiMap, marks: [...uiMap.marks, ...omniMarks].slice(0, 48) }
        : {
            captureId,
            width: shot.width,
            height: shot.height,
            marks: omniMarks.slice(0, 48),
          };
    }
  }

  const state = mergeGroundedUiState({
    captureId,
    width: shot.width,
    height: shot.height,
    activeApp: ctx.appName,
    windowTitle: ctx.windowTitle,
    marks: uiMap?.marks ?? [],
    capturedAt: Date.now(),
  });

  return { state, imageDataUrl: shot.imageDataUrl };
}

async function readRegionSummary(
  host: AletheiaComputerOperatorHost,
  capture: CaptureBundle,
  signal?: AbortSignal,
): Promise<{ ok: boolean; message: string; readSummary?: string }> {
  if (resolveAnthropicApiKey() && capture.imageDataUrl) {
    try {
      const optimized = optimizeVisualAskImage(
        capture.imageDataUrl,
        { width: capture.state.width, height: capture.state.height },
        { prompt: READ_REGION_PROMPT, preset: "general" },
      );
      const response = await askIivoGlass(
        host.getConfig(),
        {
          prompt: READ_REGION_PROMPT,
          visualIntent: true,
          latestScreenshot: {
            imageDataUrl: optimized.imageDataUrl,
            label: host.resolveCaptureTarget().label,
            capturedAt: new Date().toISOString(),
          },
        },
        signal,
      );
      const summary = response.answer?.trim() ?? "";
      if (summary.length > 0) {
        return { ok: true, message: "Screen read complete.", readSummary: summary };
      }
    } catch (err) {
      if (signal?.aborted) {
        return { ok: false, message: "Computer operator aborted." };
      }
    }
  }

  const fallback = buildReadRegionFallback(host, capture.state);
  return {
    ok: fallback.length > 40,
    message: "Used accessibility fallback summary.",
    readSummary: fallback,
  };
}

async function executeOperatorAction(
  action: OperatorAction,
  before: GroundedUiState,
  host: AletheiaComputerOperatorHost,
  capture?: CaptureBundle,
  signal?: AbortSignal,
): Promise<{ ok: boolean; message: string; readSummary?: string; method?: string }> {
  const displayAwareness = host.getDisplayAwareness?.() ?? null;

  switch (action.kind) {
    case "focus_app": {
      if (!action.app) return { ok: false, message: "focus_app missing app." };
      const result = await executeComputerUse({
        operation: "activate_app",
        targetApp: action.app,
        displayAwareness,
      });
      await delay(450);
      return { ok: result.ok, message: result.message, method: result.method };
    }
    case "click_target": {
      const coords = resolveClickCoordinates(before, host, action.targetId);
      if (!coords) {
        return { ok: false, message: `Target ${action.targetId ?? "?"} not in grounded map.` };
      }
      const result = await executeComputerUse({
        operation: "click_target",
        clickX: coords.clickX,
        clickY: coords.clickY,
        axLabel: coords.label,
        displayAwareness,
      });
      await delay(500);
      return {
        ok: result.ok,
        message: result.fallbackUsed
          ? `${result.message} (fallback tier used)`
          : result.message,
        method: result.method,
      };
    }
    case "type_text": {
      if (!action.text?.trim()) return { ok: false, message: "type_text missing text." };
      const result = await executeComputerUse({
        operation: "type_text",
        text: action.text,
        targetApp: before.activeApp,
        displayAwareness,
      });
      return { ok: result.ok, message: result.message, method: result.method };
    }
    case "press_keys": {
      if (!action.keys?.trim()) {
        return { ok: false, message: "press_keys requires an explicit keys shortcut." };
      }
      const result = await executeComputerUse({
        operation: "press_shortcut",
        shortcut: action.keys.trim(),
        targetApp: before.activeApp,
        displayAwareness,
      });
      return { ok: result.ok, message: result.message, method: result.method };
    }
    case "scroll": {
      const result = await executeComputerUse({
        operation: "press_shortcut",
        shortcut: "page-down",
        targetApp: before.activeApp,
        displayAwareness,
      });
      await delay(350);
      return {
        ok: result.ok,
        message: result.ok ? result.message : "Scroll attempted via Page Down.",
        method: result.method,
      };
    }
    case "wait_for": {
      await delay(action.waitMs ?? 800);
      return { ok: true, message: `Waited ${action.waitMs ?? 800}ms.` };
    }
    case "open_url": {
      if (!action.url?.trim()) return { ok: false, message: "open_url missing url." };
      const planApps = host.getSnapshot()?.plan.targetApps ?? [];
      const browser = action.app ?? resolveBrowserApp(planApps, before.activeApp);
      const activate = await executeComputerUse({
        operation: "activate_app",
        targetApp: browser,
        displayAwareness,
      });
      if (!activate.ok) return { ok: false, message: activate.message };
      const typeResult = await executeComputerUse({
        operation: "type_text",
        text: action.url.trim(),
        targetApp: browser,
        displayAwareness,
      });
      return { ok: typeResult.ok, message: typeResult.message, method: typeResult.method };
    }
    case "read_region": {
      const bundle = capture ?? await captureGroundedUiState(host, signal);
      return readRegionSummary(host, bundle, signal);
    }
    case "done":
      return { ok: true, message: action.reason ?? "Task marked complete." };
    case "pause":
      return { ok: false, message: action.reason ?? "Paused." };
    default:
      return { ok: false, message: `Unsupported action ${action.kind}.` };
  }
}

function replanComputerOperatorSnapshot(
  snapshot: AletheiaComputerOperatorSnapshot,
  goal: string,
): AletheiaComputerOperatorSnapshot {
  const plan = planFromNaturalLanguage(goal);
  const grant = buildSessionGrantFromPlan(plan, snapshot.loopId);
  return {
    ...snapshot,
    plan,
    sessionGrant: grant,
    phase: plan.requiresConfirmation ? "awaiting_confirm" : "awaiting_grant",
    step: 0,
    audit: [],
    readSummary: undefined,
    summary: undefined,
    pauseReason: undefined,
    narrative: `Planned: ${plan.goal}`,
    updatedAt: Date.now(),
  };
}

function failOperatorLoop(
  host: AletheiaComputerOperatorHost,
  snapshot: AletheiaComputerOperatorSnapshot,
  summary: string,
  intent?: ActionIntent,
  attribution?: string | null,
): void {
  const failed = finalizeComputerOperatorSnapshot(snapshot, {
    ok: false,
    summary,
    phase: "failed",
  });
  setSnapshot(host, failed);
  if (intent) {
    recordLedger(intent, "failed", summary, false, attribution);
  }
  host.onComplete?.(summary, false);
}

/** Update awaiting session goal without changing loopId (preserves inline grant cards). */
export function refreshComputerOperatorGoal(
  host: AletheiaComputerOperatorHost,
  goal: string,
): AletheiaComputerOperatorSnapshot | undefined {
  const current = host.getSnapshot();
  if (!current) return undefined;
  if (current.phase !== "awaiting_grant" && current.phase !== "awaiting_confirm") {
    return undefined;
  }
  const trimmed = goal.trim();
  if (!trimmed || trimmed === COMPUTER_OPERATOR_PLACEHOLDER_GOAL) return current;
  if (trimmed === current.plan.goal) return current;
  const updated = replanComputerOperatorSnapshot(current, trimmed);
  setSnapshot(host, updated);
  return updated;
}

export function dismissAletheiaComputerOperator(host: AletheiaComputerOperatorHost): boolean {
  const snap = host.getSnapshot();
  if (!snap) return false;
  if (snap.phase !== "complete" && snap.phase !== "failed") return false;
  host.setSnapshot(undefined);
  host.push();
  return true;
}

async function beginComputerOperatorRun(
  host: AletheiaComputerOperatorHost,
  grantedBy: string,
): Promise<void> {
  if (isAletheiaComputerOperatorRunning()) return;

  const runId = randomUUID();
  activeComputerOperatorRunId = runId;
  computerOperatorCancelRequested = false;
  const abortController = startAletheiaCompanionOperation();

  try {
    await runAletheiaComputerOperatorLoop(host, runId, grantedBy, abortController.signal);
  } finally {
    finishAletheiaCompanionOperation(abortController);
    if (activeComputerOperatorRunId === runId) {
      activeComputerOperatorRunId = null;
    }
    computerOperatorCancelRequested = false;
  }
}

/** Start planning — shows grant card unless autoRun (persistent always-allow). */
export function startAletheiaComputerOperator(
  host: AletheiaComputerOperatorHost,
  goal: string,
  options?: {
    autoRun?: boolean;
    grantedBy?: string;
    entrySurface?: ComputerOperatorEntrySurface;
  },
): AletheiaComputerOperatorSnapshot | undefined {
  if (isAletheiaComputerOperatorRunning()) {
    return host.getSnapshot();
  }
  const normalizedGoal =
    goal.trim()
    || (options?.autoRun === false ? COMPUTER_OPERATOR_PLACEHOLDER_GOAL : "");
  if (!normalizedGoal) {
    return undefined;
  }
  const plan = planFromNaturalLanguage(normalizedGoal);
  const snapshot = initialComputerOperatorSnapshot(plan, {
    awaitingConfirm: plan.requiresConfirmation,
    entrySurface: options?.entrySurface,
  });
  const grant = buildSessionGrantFromPlan(plan, snapshot.loopId);
  snapshot.sessionGrant = grant;

  if (options?.autoRun) {
    snapshot.sessionGrant = grantComputerOperatorSession(
      grant,
      options.grantedBy ?? "always-allow",
    );
    snapshot.phase = "running";
    setSnapshot(host, snapshot);
    void beginComputerOperatorRun(host, options.grantedBy ?? "always-allow");
    return snapshot;
  }

  setSnapshot(host, snapshot);
  return snapshot;
}

/** User granted bounded session — run the operator loop. */
export async function grantAndRunAletheiaComputerOperator(
  host: AletheiaComputerOperatorHost,
  loopId: string,
  grantedBy = "user-tap",
  options?: { goal?: string },
): Promise<GrantAndRunResult> {
  if (isAletheiaComputerOperatorRunning()) {
    return { ok: false, reason: "Computer operator is already running." };
  }

  let current = host.getSnapshot();
  if (!current || current.loopId !== loopId) {
    return {
      ok: false,
      reason: "Grant failed: session expired. Click COMPUTER to start a new task.",
    };
  }
  if (!current.sessionGrant) {
    return { ok: false, reason: "Grant failed: no session grant found." };
  }
  if (current.phase !== "awaiting_grant" && current.phase !== "awaiting_confirm") {
    return { ok: false, reason: "Grant failed: operator is not in the expected state." };
  }

  const goalOverride = options?.goal?.trim();
  const effectiveGoal =
    goalOverride && goalOverride !== COMPUTER_OPERATOR_PLACEHOLDER_GOAL
      ? goalOverride
      : current.plan.goal;

  if (!effectiveGoal.trim() || effectiveGoal === COMPUTER_OPERATOR_PLACEHOLDER_GOAL) {
    return { ok: false, reason: "Please enter a task before granting." };
  }

  if (effectiveGoal !== current.plan.goal) {
    current = replanComputerOperatorSnapshot(current, effectiveGoal);
    setSnapshot(host, current);
  }

  const granted = grantComputerOperatorSession(current.sessionGrant, grantedBy);
  const snapshot: AletheiaComputerOperatorSnapshot = {
    ...current,
    sessionGrant: granted,
    phase: "running",
    updatedAt: Date.now(),
  };
  setSnapshot(host, snapshot);

  await beginComputerOperatorRun(host, grantedBy);
  return { ok: true };
}

export async function runAletheiaComputerOperatorLoop(
  host: AletheiaComputerOperatorHost,
  runId?: string,
  grantedBy = "session-l3",
  signal?: AbortSignal,
): Promise<void> {
  const base = host.getSnapshot();
  if (!base) return;
  if (!isSessionGrantActive(base.sessionGrant)) {
    failOperatorLoop(host, base, "Computer operator session grant is not active.");
    return;
  }
  if (runId && activeComputerOperatorRunId !== runId) return;

  const intent = operatorIntent(host.getSessionId(), base);
  const confirmation = sessionConfirmation(intent, grantedBy);
  const scopeGate = validateActionScope(intent);
  if (!scopeGate.ok) {
    failOperatorLoop(host, base, scopeGate.reason, intent);
    return;
  }

  const attribution = host.getLedgerAttribution?.() ?? null;
  const clickedTargetIds: string[] = [];
  const failedTargetIds: string[] = [];
  let snapshot = base;
  let readSummary = snapshot.readSummary;
  let lastError: string | undefined;
  let pendingCapture: CaptureBundle | null = null;

  recordLedger(
    intent,
    "planning",
    snapshot.sessionGrant?.declaration ?? snapshot.plan.goal,
    true,
    attribution,
  );
  recordLedger(
    intent,
    "executing",
    `Session granted (${confirmation.confirmedBy}).`,
    true,
    attribution,
  );

  while (snapshot.step < snapshot.plan.stepBudget) {
    if (stopIfRequested(host, snapshot, signal)) return;

    snapshot = clearOperatorGhostCursor(host, snapshot);

    const captured = await captureGroundedUiStateOrFail(host, snapshot, signal, pendingCapture);
    pendingCapture = null;
    if (!captured) return;
    if (stopIfRequested(host, snapshot, signal, "Cancelled during capture.")) return;

    const before = captured.state;
    const decision: OperatorStepDecision = await resolveOperatorStepDecision(
      host.getConfig(),
      {
        plan: snapshot.plan,
        state: before,
        screenshotDataUrl: captured.imageDataUrl,
        step: snapshot.step,
        clickedTargetIds,
        failedTargetIds,
        readSummary,
        lastError,
        stepHistory: auditRowsToStepHistory(snapshot.audit),
      },
      signal,
    );

    if (stopIfRequested(host, snapshot, signal, "Cancelled during planning.")) return;

    if (decision.action.kind === "pause") {
      snapshot = {
        ...snapshot,
        phase: "paused",
        pauseReason: decision.pauseReason ?? decision.action.reason,
        currentBelief: decision.currentBelief,
        narrative: decision.pauseReason ?? decision.action.reason,
        updatedAt: Date.now(),
      };
      setSnapshot(host, snapshot);
      recordLedger(intent, "failed", snapshot.pauseReason ?? "Paused.", false, attribution);
      host.onComplete?.(snapshot.pauseReason ?? "Paused.", false);
      return;
    }

    if (decision.action.kind === "done") {
      const summary =
        readSummary?.trim()
        || decision.action.reason
        || "Computer operator task complete.";
      snapshot = appendComputerOperatorAudit(snapshot, {
        step: snapshot.step + 1,
        belief: decision.currentBelief,
        intendedEffect: decision.intendedNextEffect,
        action: decision.action,
        narration: narrateOperatorStep(decision),
        ok: true,
        verificationSummary: summary,
      });
      snapshot = finalizeComputerOperatorSnapshot(snapshot, { ok: true, summary });
      setSnapshot(host, snapshot);
      recordLedger(intent, "complete", summary, true, attribution);
      host.onComplete?.(summary, true);
      return;
    }

    const grantCheck = isOperatorActionAllowedByGrant(
      decision.action,
      snapshot.sessionGrant!,
    );
    if (!grantCheck.ok) {
      snapshot = finalizeComputerOperatorSnapshot(snapshot, {
        ok: false,
        summary: grantCheck.reason,
      });
      setSnapshot(host, snapshot);
      recordLedger(intent, "failed", grantCheck.reason, false, attribution);
      host.onComplete?.(grantCheck.reason, false);
      return;
    }

    if (stopIfRequested(host, snapshot, signal, "Cancelled before execution.")) return;

    recordLedger(
      intent,
      "executing",
      narrateOperatorStep(decision),
      null,
      attribution,
    );

    if (decision.action.kind === "click_target") {
      snapshot = await showOperatorGhostBeforeClick(
        host,
        snapshot,
        before,
        decision.action.targetId,
      );
    }

    const exec = await executeOperatorAction(
      decision.action,
      before,
      host,
      decision.action.kind === "read_region" ? captured : undefined,
      signal,
    );
    snapshot = clearOperatorGhostCursor(host, snapshot);
    if (stopIfRequested(host, snapshot, signal, "Cancelled during execution.")) return;
    if (exec.readSummary) readSummary = exec.readSummary;

    const afterCapture = await captureGroundedUiStateOrFail(host, snapshot, signal, null);
    if (!afterCapture) return;
    pendingCapture = afterCapture;
    if (stopIfRequested(host, snapshot, signal, "Cancelled during verification capture.")) return;

    const verification = verifyOperatorAction(decision.action, before, afterCapture.state);
    const stepOk = isOperatorStepSuccessful(decision.action, exec.ok, verification);

    if (decision.action.kind === "click_target" && decision.action.targetId) {
      if (stepOk) {
        clickedTargetIds.push(decision.action.targetId);
      } else {
        failedTargetIds.push(decision.action.targetId);
      }
    }

    if (!stepOk) {
      lastError = exec.message || verification.summary;
    } else {
      lastError = undefined;
    }

    snapshot = appendComputerOperatorAudit(snapshot, {
      step: snapshot.step + 1,
      belief: decision.currentBelief,
      intendedEffect: decision.intendedNextEffect,
      action: decision.action,
      narration: narrateOperatorStep(decision, verification),
      ok: stepOk,
      verificationSummary: verification.summary,
    });
    snapshot = {
      ...snapshot,
      step: snapshot.step + 1,
      currentBelief: decision.currentBelief,
      narrative: narrateOperatorStep(decision, verification),
      readSummary,
      updatedAt: Date.now(),
    };
    setSnapshot(host, snapshot);

    recordLedger(
      intent,
      stepOk ? "verifying" : "failed",
      `${narrateOperatorStep(decision, verification)} — ${exec.message}`,
      stepOk,
      attribution,
      stepOk ? null : exec.message,
    );

    if (!stepOk && decision.action.kind !== "read_region") {
      await delay(400);
      continue;
    }

    await delay(300);
  }

  const summary = `Stopped after ${snapshot.plan.stepBudget} steps without completion.`;
  snapshot = finalizeComputerOperatorSnapshot(snapshot, { ok: false, summary });
  setSnapshot(host, snapshot);
  host.onComplete?.(summary, false);
}

export function cancelAletheiaComputerOperator(host: AletheiaComputerOperatorHost): void {
  requestAletheiaComputerOperatorCancel();
  const snap = host.getSnapshot();
  if (!snap) return;
  if (snap.phase === "complete" || snap.phase === "failed") return;
  finalizeComputerOperatorCancelled(host, snap, COMPUTER_OPERATOR_CANCEL_SUMMARY);
}
