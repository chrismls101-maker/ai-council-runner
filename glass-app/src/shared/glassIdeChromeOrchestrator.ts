/**
 * Pure policy for Glass IDE terminal chrome — expand/collapse signals and timers.
 * Main process owns timers; this module is unit-tested policy only.
 */

import type { QaCheckId } from "./glassQaPipeline.ts";

export const GLASS_IDE_TERMINAL_AUTO_COLLAPSE_MS = 15_000;
/** Manual toggle blocks auto expand/collapse until this window elapses. */
export const GLASS_IDE_TERMINAL_MANUAL_OVERRIDE_MS = 120_000;

const SHELL_TOOL_NAMES = new Set([
  "bash",
  "run_terminal_cmd",
  "execute_command",
  "shell",
  "run_command",
]);

const SHELL_QA_CHECK_IDS = new Set<QaCheckId>(["types", "tests", "lint"]);

export interface IdeChromeOrchestratorState {
  expanded: boolean;
  lastTerminalInteractionAt: number;
  manualOverrideUntil: number | null;
  /** Agent or QA failure — blocks auto-collapse until cleared on new run. */
  runFailed: boolean;
}

export type IdeChromeSignal =
  | { kind: "ide-opened" }
  | { kind: "ide-closed" }
  | { kind: "user-set-expanded"; expanded: boolean; manual?: boolean }
  | { kind: "terminal-interaction" }
  | { kind: "agent-tool-start"; toolName: string }
  | { kind: "agent-error" }
  | { kind: "qa-shell-check-start" }
  | { kind: "post-run-complete"; success: boolean }
  | { kind: "pty-error" }
  | { kind: "dev-server-detected" }
  | { kind: "terminal-run" };

export interface IdeChromeEffect {
  expanded: boolean;
  lastTerminalInteractionAt: number;
  manualOverrideUntil: number | null;
  runFailed: boolean;
  scheduleAutoCollapse: boolean;
  cancelAutoCollapse: boolean;
}

export function initialIdeChromeOrchestratorState(): IdeChromeOrchestratorState {
  return {
    expanded: false,
    lastTerminalInteractionAt: 0,
    manualOverrideUntil: null,
    runFailed: false,
  };
}

export function shouldExpandForToolStart(toolName: string | undefined): boolean {
  if (!toolName) return false;
  return SHELL_TOOL_NAMES.has(toolName.toLowerCase());
}

export function shouldExpandForQaCheck(checkId: QaCheckId): boolean {
  return SHELL_QA_CHECK_IDS.has(checkId);
}

const PTY_ERROR_RE =
  /\b(error|Error|ERROR|FAIL|fail|failed|exception|Exception|panic|PANIC|fatal|Fatal|FATAL|❌|✗)\b/;

export function isPtyErrorLine(line: string): boolean {
  const text = line.trim();
  if (!text) return false;
  return (
    PTY_ERROR_RE.test(text)
    || /^\s*(at\s+\w|\w+Error:)/.test(text)
  );
}

function manualActive(state: IdeChromeOrchestratorState, now: number): boolean {
  return state.manualOverrideUntil !== null && now < state.manualOverrideUntil;
}

function canAutoExpand(state: IdeChromeOrchestratorState, now: number): boolean {
  return !manualActive(state, now);
}

function canAutoCollapse(state: IdeChromeOrchestratorState, now: number): boolean {
  return !state.runFailed && !manualActive(state, now);
}

function expandEffect(
  state: IdeChromeOrchestratorState,
  cancelAutoCollapse: boolean,
): IdeChromeEffect {
  return {
    expanded: true,
    lastTerminalInteractionAt: state.lastTerminalInteractionAt,
    manualOverrideUntil: state.manualOverrideUntil,
    runFailed: state.runFailed,
    scheduleAutoCollapse: false,
    cancelAutoCollapse,
  };
}

function collapseEffect(state: IdeChromeOrchestratorState): IdeChromeEffect {
  return {
    expanded: false,
    lastTerminalInteractionAt: state.lastTerminalInteractionAt,
    manualOverrideUntil: state.manualOverrideUntil,
    runFailed: state.runFailed,
    scheduleAutoCollapse: false,
    cancelAutoCollapse: true,
  };
}

export function applyIdeChromeSignal(
  state: IdeChromeOrchestratorState,
  signal: IdeChromeSignal,
  now: number,
): IdeChromeEffect {
  switch (signal.kind) {
    case "ide-opened":
      return {
        expanded: false,
        lastTerminalInteractionAt: 0,
        manualOverrideUntil: null,
        runFailed: false,
        scheduleAutoCollapse: false,
        cancelAutoCollapse: true,
      };

    case "ide-closed":
      return {
        ...initialIdeChromeOrchestratorState(),
        scheduleAutoCollapse: false,
        cancelAutoCollapse: true,
      };

    case "user-set-expanded": {
      const manualUntil = signal.manual
        ? now + GLASS_IDE_TERMINAL_MANUAL_OVERRIDE_MS
        : state.manualOverrideUntil;
      if (signal.expanded) {
        return {
          ...expandEffect(state, true),
          manualOverrideUntil: manualUntil,
        };
      }
      return {
        ...collapseEffect(state),
        manualOverrideUntil: manualUntil,
      };
    }

    case "terminal-interaction":
      return {
        expanded: state.expanded,
        lastTerminalInteractionAt: now,
        manualOverrideUntil: state.manualOverrideUntil,
        runFailed: state.runFailed,
        scheduleAutoCollapse: false,
        cancelAutoCollapse: true,
      };

    case "agent-tool-start":
      if (!shouldExpandForToolStart(signal.toolName) || !canAutoExpand(state, now)) {
        return noopEffect(state);
      }
      return expandEffect(state, true);

    case "agent-error":
      return {
        expanded: state.expanded,
        lastTerminalInteractionAt: state.lastTerminalInteractionAt,
        manualOverrideUntil: state.manualOverrideUntil,
        runFailed: true,
        scheduleAutoCollapse: false,
        cancelAutoCollapse: true,
      };

    case "qa-shell-check-start":
      if (!canAutoExpand(state, now)) return noopEffect(state);
      return expandEffect(state, true);

    case "post-run-complete": {
      if (!signal.success) {
        return {
          expanded: state.expanded,
          lastTerminalInteractionAt: state.lastTerminalInteractionAt,
          manualOverrideUntil: state.manualOverrideUntil,
          runFailed: true,
          scheduleAutoCollapse: false,
          cancelAutoCollapse: true,
        };
      }
      if (!canAutoCollapse(state, now)) {
        return noopEffect(state);
      }
      const idleSinceInteraction = now - state.lastTerminalInteractionAt;
      const alreadyInteracted = state.lastTerminalInteractionAt > 0;
      if (alreadyInteracted && idleSinceInteraction < GLASS_IDE_TERMINAL_AUTO_COLLAPSE_MS) {
        return {
          ...state,
          scheduleAutoCollapse: true,
          cancelAutoCollapse: false,
        };
      }
      if (!alreadyInteracted) {
        return {
          ...state,
          scheduleAutoCollapse: true,
          cancelAutoCollapse: false,
        };
      }
      return collapseEffect(state);
    }

    case "pty-error":
      if (!canAutoExpand(state, now)) return noopEffect(state);
      return expandEffect(state, true);

    case "dev-server-detected":
    case "terminal-run":
      if (!canAutoExpand(state, now)) return noopEffect(state);
      return expandEffect(state, true);

    default:
      return noopEffect(state);
  }
}

function noopEffect(state: IdeChromeOrchestratorState): IdeChromeEffect {
  return {
    expanded: state.expanded,
    lastTerminalInteractionAt: state.lastTerminalInteractionAt,
    manualOverrideUntil: state.manualOverrideUntil,
    runFailed: state.runFailed,
    scheduleAutoCollapse: false,
    cancelAutoCollapse: false,
  };
}

export function shouldAutoCollapseNow(
  state: IdeChromeOrchestratorState,
  now: number,
): boolean {
  if (!state.expanded || state.runFailed) return false;
  if (manualActive(state, now)) return false;
  if (state.lastTerminalInteractionAt <= 0) return true;
  return now - state.lastTerminalInteractionAt >= GLASS_IDE_TERMINAL_AUTO_COLLAPSE_MS;
}
