/**
 * AletheiaActionVerifier — compare UI state before/after each operator step.
 */

import type { GroundedUiState } from "./aletheiaGroundedUiState.ts";
import type { OperatorAction, OperatorActionKind } from "./aletheiaComputerOperatorTypes.ts";

export interface ActionVerificationResult {
  ok: boolean;
  summary: string;
  signals: string[];
  expectedEffectObserved: boolean;
}

function appsMatch(activeApp: string | undefined, targetApp: string | undefined): boolean {
  if (!activeApp || !targetApp) return false;
  return activeApp.toLowerCase().includes(targetApp.toLowerCase())
    || targetApp.toLowerCase().includes(activeApp.toLowerCase());
}

function candidateAbsent(
  before: GroundedUiState,
  after: GroundedUiState,
  targetId: string | undefined,
): boolean {
  if (!targetId) return false;
  const beforeHad = before.candidates.some((c) => c.id === targetId);
  const afterHas = after.candidates.some((c) => c.id === targetId);
  return beforeHad && !afterHas;
}

function newLabelsVisible(before: GroundedUiState, after: GroundedUiState): string[] {
  const beforeLabels = new Set(before.candidates.map((c) => c.label.toLowerCase()));
  return after.candidates
    .filter((c) => c.label.length > 2 && !beforeLabels.has(c.label.toLowerCase()))
    .map((c) => c.label)
    .slice(0, 5);
}

/** Actions where successful execution alone is enough when UI delta is slow or subtle. */
export function executionTrustworthyWithoutUiDelta(kind: OperatorActionKind): boolean {
  return kind === "focus_app"
    || kind === "click_target"
    || kind === "scroll"
    || kind === "wait_for"
    || kind === "type_text"
    || kind === "press_keys"
    || kind === "open_url";
}

/** Verify whether the intended operator action produced an observable UI change. */
export function verifyOperatorAction(
  action: OperatorAction,
  before: GroundedUiState,
  after: GroundedUiState,
): ActionVerificationResult {
  const signals: string[] = [];

  if (action.kind === "focus_app" && action.app) {
    if (appsMatch(after.activeApp, action.app)) {
      signals.push(`Focused app is now ${after.activeApp ?? action.app}`);
    }
    if (before.activeApp !== after.activeApp) {
      signals.push(`Front app changed from ${before.activeApp ?? "unknown"} to ${after.activeApp ?? "unknown"}`);
    }
  }

  if (action.kind === "click_target") {
    if (candidateAbsent(before, after, action.targetId)) {
      signals.push("Clicked target no longer visible");
    }
    if (before.windowTitle !== after.windowTitle && after.windowTitle) {
      signals.push(`Window title changed to "${after.windowTitle}"`);
    }
    const fresh = newLabelsVisible(before, after);
    if (fresh.length) {
      signals.push(`New UI labels: ${fresh.join(", ")}`);
    }
    if (before.captureId !== after.captureId) {
      signals.push("Screen state refreshed after click");
    }
  }

  if (action.kind === "open_url") {
    if (before.windowTitle !== after.windowTitle) {
      signals.push("Window title changed after navigation");
    }
    if (action.url && after.windowTitle?.includes(action.url)) {
      signals.push("URL visible in window title");
    }
  }

  if (action.kind === "type_text" || action.kind === "press_keys") {
    const fresh = newLabelsVisible(before, after);
    if (fresh.length) signals.push("UI updated after input");
    if (before.windowTitle !== after.windowTitle) {
      signals.push("Window context changed after input");
    }
  }

  if (action.kind === "scroll") {
    const beforeIds = new Set(before.candidates.map((c) => c.id));
    const scrolled = after.candidates.some((c) => !beforeIds.has(c.id));
    if (scrolled) signals.push("New scroll region candidates appeared");
    if (before.windowTitle !== after.windowTitle) {
      signals.push("Window context changed after scroll");
    }
  }

  if (action.kind === "read_region" || action.kind === "wait_for") {
    signals.push("Observation step — no execution verification required");
  }

  if (action.kind === "done") {
    signals.push("Operator marked task complete");
  }

  const expectedEffectObserved = signals.length > 0;
  const ok =
    action.kind === "read_region"
    || action.kind === "wait_for"
    || action.kind === "done"
    || expectedEffectObserved;

  const summary =
    signals.length > 0
      ? signals.join("; ")
      : "No observable UI change detected after action.";

  return {
    ok,
    summary,
    signals,
    expectedEffectObserved,
  };
}

/** Combine execution result with verification for step success. */
export function isOperatorStepSuccessful(
  action: OperatorAction,
  execOk: boolean,
  verification: ActionVerificationResult,
): boolean {
  if (!execOk) return false;
  if (action.kind === "read_region" || action.kind === "wait_for" || action.kind === "done") {
    return true;
  }
  if (verification.ok) return true;
  return executionTrustworthyWithoutUiDelta(action.kind);
}

/** Check whether success criteria appear satisfied from current grounded state. */
export function evaluateOperatorSuccess(
  successCriteria: string[],
  state: GroundedUiState,
  readSummary?: string,
  goal?: string,
): { complete: boolean; matched: string[] } {
  const matched: string[] = [];
  const lowerTitle = state.windowTitle?.toLowerCase() ?? "";
  const labels = state.candidates.map((c) => c.label.toLowerCase()).join(" ");
  const goalLower = goal?.toLowerCase() ?? "";
  const needsSummary = /\bsummar/.test(goalLower)
    || successCriteria.some((c) => c.toLowerCase().includes("summar"));

  for (const criterion of successCriteria) {
    const lower = criterion.toLowerCase();
    if (lower.includes("summar") && readSummary?.trim()) {
      matched.push(criterion);
      continue;
    }
    if (lower.includes("unread") && (labels.includes("unread") || lowerTitle.includes("unread"))) {
      matched.push(criterion);
      continue;
    }
    if (lower.includes("thread") && (labels.includes("thread") || lowerTitle.includes("thread"))) {
      matched.push(criterion);
      continue;
    }
    if (lower.includes("focused") || lower.includes("target app")) {
      const appHint = criterion.split(":").pop()?.trim().toLowerCase() ?? "";
      if (appHint && state.activeApp?.toLowerCase().includes(appHint.split(",")[0].trim())) {
        matched.push(criterion);
      }
    }
  }

  const summaryReady =
    Boolean(readSummary?.trim())
    && readSummary!.trim().length >= 80
    && (!needsSummary || /\b(message|thread|unread|channel|reply|conversation)\b/i.test(readSummary!));

  const complete =
    needsSummary
      ? summaryReady && matched.length >= 1
      : matched.length >= Math.min(2, successCriteria.length);

  return { complete, matched };
}
