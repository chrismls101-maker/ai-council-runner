/**
 * Glass IDE — trust ledger + run completion card (pure).
 */

import type { GlassState } from "./ipc.ts";
import type { CoderTranscriptItem } from "./glassIdeCoderTranscript.ts";
import { isCoderWriteTool } from "./glassIdeCoderTranscript.ts";
import {
  formatCoderRunUsageUsd,
  formatTokenCount,
} from "./coderAgentModels.ts";
import { INSPECT_TOOL_NAMES } from "./glassIdeTranscriptCollapse.ts";
import {
  deriveQaCompletionLists,
  qaProgressCounters,
  type QaShipState,
} from "./glassQaPipeline.ts";
import { canRollbackRun } from "./coderCheckpoints.ts";

export interface GlassIdeTrustLedgerCounter {
  id: string;
  label: string;
  value: number;
  formatted: string;
}

export interface GlassIdeTrustLedgerModel {
  visible: boolean;
  counters: GlassIdeTrustLedgerCounter[];
  usageLine: string | null;
}

export interface GlassIdeCompletionCardModel {
  visible: boolean;
  tone: "ok" | "warn" | "error" | "neutral";
  headline: string;
  detail: string | null;
  nextStep: string | null;
  shipState?: QaShipState | null;
  shipLabel?: string | null;
  shipSubline?: string | null;
  qaPassed?: string[];
  qaWarnings?: string[];
  qaSkipped?: string[];
  qaFailed?: string[];
  reviewChangesPath?: string | null;
  showReviewChangesCta?: boolean;
  canRollback?: boolean;
  rollbackRunId?: string | null;
}

export interface GlassIdeRunActivityStats {
  filesRead: number;
  inspectSteps: number;
  commandsRun: number;
  filesChanged: number;
  writeAttempts: number;
}

function resolveActiveRunId(
  state: Pick<GlassState, "agentRun">,
  runId: string | null,
): string | null {
  return state.agentRun?.agentId === "coder" ? state.agentRun.runId : runId;
}

export function scanCoderRunActivity(
  transcript: CoderTranscriptItem[],
  changeLog: GlassState["agentChangeLog"],
  activeRunId: string | null,
): GlassIdeRunActivityStats {
  let filesRead = 0;
  let inspectSteps = 0;
  let commandsRun = 0;
  let writeAttempts = 0;
  const changedPaths = new Set<string>();

  for (const item of transcript) {
    if (item.kind !== "tool") continue;

    if (item.toolName === "read_file" && item.status === "done") {
      filesRead += 1;
    }

    if (
      INSPECT_TOOL_NAMES.has(item.toolName)
      && item.toolName !== "read_file"
      && item.status === "done"
    ) {
      inspectSteps += 1;
    }

    if (item.toolName === "run_project_command" && item.status === "done") {
      commandsRun += 1;
    }

    if (isCoderWriteTool(item.toolName)) {
      writeAttempts += 1;
      if (item.relativePath && item.status === "done") {
        changedPaths.add(item.relativePath);
      }
    }
  }

  for (const entry of changeLog ?? []) {
    if (!activeRunId || entry.runId !== activeRunId) continue;
    if (entry.action === "applied" || entry.action === "deleted") {
      changedPaths.add(entry.relativePath);
    }
  }

  return {
    filesRead,
    inspectSteps,
    commandsRun,
    filesChanged: changedPaths.size,
    writeAttempts,
  };
}

function formatCounter(value: number, singular: string, plural?: string): string {
  const word = value === 1 ? singular : (plural ?? `${singular}s`);
  return `${value} ${word}`;
}

export function deriveGlassIdeTrustLedger(input: {
  transcript: CoderTranscriptItem[];
  state: Pick<GlassState, "agentRun" | "agentChangeLog" | "coderRunUsage" | "qaPipelineState">;
  runId: string | null;
}): GlassIdeTrustLedgerModel {
  const { transcript, state, runId } = input;
  const activeRunId = resolveActiveRunId(state, runId);
  const agentRun = state.agentRun?.agentId === "coder" ? state.agentRun : null;
  const agentActive = Boolean(
    activeRunId
    && agentRun
    && agentRun.runId === activeRunId
    && (agentRun.status === "running" || agentRun.status === "done" || agentRun.status === "error"),
  );

  const stats = scanCoderRunActivity(transcript, state.agentChangeLog, activeRunId);
  const counters: GlassIdeTrustLedgerCounter[] = [];

  if (stats.filesRead > 0) {
    counters.push({
      id: "read",
      label: "Read",
      value: stats.filesRead,
      formatted: formatCounter(stats.filesRead, "file"),
    });
  }

  if (stats.inspectSteps > 0) {
    counters.push({
      id: "inspect",
      label: "Inspected",
      value: stats.inspectSteps,
      formatted: formatCounter(stats.inspectSteps, "step"),
    });
  }

  if (stats.filesChanged > 0) {
    counters.push({
      id: "changed",
      label: "Changed",
      value: stats.filesChanged,
      formatted: formatCounter(stats.filesChanged, "file"),
    });
  }

  if (stats.commandsRun > 0) {
    counters.push({
      id: "commands",
      label: "Commands",
      value: stats.commandsRun,
      formatted: formatCounter(stats.commandsRun, "command"),
    });
  }

  const qa = state.qaPipelineState;
  if (qa && qa.runId === activeRunId && qa.status !== "waiting") {
    const progress = qaProgressCounters(qa.checks);
    if (progress.complete > 0) {
      counters.push({
        id: "qa",
        label: "QA",
        value: progress.complete,
        formatted: progress.summaryLine,
      });
    }
  }

  const usage = state.coderRunUsage?.runId === activeRunId ? state.coderRunUsage : null;
  let usageLine: string | null = null;
  if (usage && (usage.inputTokens > 0 || usage.outputTokens > 0)) {
    const inTok = formatTokenCount(usage.inputTokens);
    const outTok = formatTokenCount(usage.outputTokens);
    const cost = formatCoderRunUsageUsd(usage.estimatedUsd);
    usageLine = `${inTok} in / ${outTok} out · est. ${cost}`;
  }

  return {
    visible: agentActive && counters.length > 0,
    counters,
    usageLine,
  };
}

function verifyOutcome(
  state: Pick<GlassState, "coderVerifyState" | "qaPipelineState" | "glassSettings">,
  activeRunId: string | null,
): { passed: boolean; failed: boolean; pending: boolean; label: string | null } {
  const verify = state.coderVerifyState;
  const qa = state.qaPipelineState;

  if (verify?.runId === activeRunId) {
    if (verify.status === "running") {
      return { passed: false, failed: false, pending: true, label: "Running checks…" };
    }
    if (verify.status === "pass") {
      return { passed: true, failed: false, pending: false, label: "Checks passed" };
    }
    if (verify.status === "fail") {
      return { passed: false, failed: true, pending: false, label: "Checks failed" };
    }
  }

  if (qa?.runId === activeRunId) {
    const running = qa.checks.some((c) => c.status === "running");
    const failed = qa.checks.some((c) => c.status === "fail");
    const warn = qa.checks.some((c) => c.status === "warn");
    const allDone = qa.status === "done"
      && qa.checks.every((c) => c.status !== "running" && c.status !== "pending");
    if (qa.status === "waiting" || running) {
      return { passed: false, failed: false, pending: true, label: "QA review running…" };
    }
    if (failed) {
      return { passed: false, failed: true, pending: false, label: "QA issues found" };
    }
    if (allDone && qa.checks.length > 0) {
      const lists = deriveQaCompletionLists(qa.checks);
      return {
        passed: lists.shipState === "ready-to-ship",
        failed: false,
        pending: false,
        label: lists.shipLabel ?? (warn ? "QA passed with warnings" : "QA passed"),
      };
    }
  }

  return { passed: false, failed: false, pending: false, label: null };
}

export function deriveGlassIdeCompletionCard(input: {
  transcript: CoderTranscriptItem[];
  state: Pick<
    GlassState,
    | "agentRun"
    | "agentChangeLog"
    | "agentPendingApproval"
    | "coderVerifyState"
    | "qaPipelineState"
    | "qaRecoveryState"
    | "coderLoopSessionId"
    | "glassSettings"
    | "coderRunUsage"
    | "lastError"
    | "coderCheckpoints"
  >;
  runId: string | null;
}): GlassIdeCompletionCardModel {
  const { transcript, state, runId } = input;
  const activeRunId = resolveActiveRunId(state, runId);
  const agentRun = state.agentRun?.agentId === "coder" ? state.agentRun : null;
  const agentRunning = Boolean(
    agentRun?.status === "running" && agentRun.runId === activeRunId,
  );

  if (!activeRunId || agentRunning) {
    return { visible: false, tone: "neutral", headline: "", detail: null, nextStep: null };
  }

  const agentDone = agentRun?.status === "done" && agentRun.runId === activeRunId;
  const agentFailed = agentRun?.status === "error" && agentRun.runId === activeRunId;
  const agentCancelled = agentRun?.status === "cancelled" && agentRun.runId === activeRunId;
  const runSettled = agentDone || agentFailed || agentCancelled;

  const verify = verifyOutcome(state, activeRunId);
  const stats = scanCoderRunActivity(transcript, state.agentChangeLog, activeRunId);
  const hasActivity = stats.filesRead > 0
    || stats.inspectSteps > 0
    || stats.commandsRun > 0
    || stats.filesChanged > 0
    || stats.writeAttempts > 0;

  if (!runSettled && !verify.pending && !verify.passed && !verify.failed) {
    return { visible: false, tone: "neutral", headline: "", detail: null, nextStep: null };
  }

  if (!hasActivity && !agentFailed && !verify.failed) {
    return { visible: false, tone: "neutral", headline: "", detail: null, nextStep: null };
  }

  let tone: GlassIdeCompletionCardModel["tone"] = "ok";
  let headline = "Run complete";
  let detail: string | null = null;
  let nextStep: string | null = null;

  if (agentFailed) {
    tone = "error";
    headline = "Run failed";
    detail = state.lastError?.trim() || "The agent stopped with an error.";
    nextStep = "Review the stream and retry with a narrower task.";
  } else if (agentCancelled) {
    tone = "warn";
    headline = "Run stopped";
    detail = stats.filesChanged > 0
      ? `Partial work — ${formatCounter(stats.filesChanged, "file")} may have changed.`
      : "Stopped before changes were applied.";
    nextStep = stats.filesChanged > 0 ? "Review touched files in the editor." : null;
  } else if (stats.filesChanged > 0) {
    headline = `Changed ${formatCounter(stats.filesChanged, "file")}`;
    if (verify.passed) {
      headline += " — checks passed";
      tone = "ok";
    } else if (verify.failed) {
      headline += " — checks failed";
      tone = "error";
      nextStep = "Review command output and fix failing checks.";
    } else if (verify.pending) {
      headline += " — verifying…";
      tone = "neutral";
    } else {
      tone = "ok";
    }
    if (!nextStep && stats.filesChanged > 0) {
      nextStep = "Review diffs in the editor before continuing.";
    }
  } else if (stats.filesRead > 0 || stats.inspectSteps > 0) {
    const inspected = stats.filesRead + stats.inspectSteps;
    headline = `Inspected ${formatCounter(inspected, "step")} — no edits`;
    tone = verify.failed ? "error" : "neutral";
    if (verify.failed) {
      headline += " — checks failed";
      nextStep = "Review verification output below.";
    }
  } else if (stats.commandsRun > 0) {
    headline = `Ran ${formatCounter(stats.commandsRun, "command")}`;
    tone = verify.failed ? "error" : "ok";
    if (verify.failed) nextStep = "Review failing command output.";
  }

  if (verify.label && !detail) {
    detail = verify.label;
  }

  const pending = state.agentPendingApproval;
  if (
    pending?.agentId === "coder"
    && pending.runId === activeRunId
  ) {
    tone = "warn";
    nextStep = `Approve or skip ${pending.relativePath.split("/").pop() ?? "change"} in the editor.`;
  }

  const usage = state.coderRunUsage?.runId === activeRunId ? state.coderRunUsage : null;
  if (usage && (usage.inputTokens > 0 || usage.outputTokens > 0)) {
    const usageBit = `${formatTokenCount(usage.inputTokens)} in / ${formatTokenCount(usage.outputTokens)} out · est. ${formatCoderRunUsageUsd(usage.estimatedUsd)}`;
    detail = detail ? `${detail} · ${usageBit}` : usageBit;
  }

  const qa = state.qaPipelineState?.runId === activeRunId ? state.qaPipelineState : null;
  const qaLists = qa?.status === "done"
    ? deriveQaCompletionLists(
      qa.checks,
      state.qaRecoveryState?.sessionId === (state.coderLoopSessionId ?? activeRunId)
        ? state.qaRecoveryState
        : null,
    )
    : null;
  if (qaLists?.shipState && !agentFailed) {
    headline = qaLists.shipLabel ?? headline;
    if (qaLists.shipState === "ready-to-ship") tone = "ok";
    else if (qaLists.shipState === "known-warnings") tone = "warn";
    else if (qaLists.shipState === "blocked") tone = "error";
    if (qaLists.shipState === "known-warnings") {
      nextStep = nextStep ?? "Review warnings and skipped checks before shipping.";
    } else if (qaLists.shipState === "blocked") {
      nextStep = nextStep ?? "Fix failing checks or review manually.";
    }
  }

  const rollbackRunId = state.coderLoopSessionId ?? activeRunId;
  const canRollback = canRollbackRun(state.coderCheckpoints, rollbackRunId);
  const firstChangedPath = stats.filesChanged > 0
    ? ([...(state.agentChangeLog ?? [])]
      .filter((e) => e.runId === activeRunId && (e.action === "applied" || e.action === "deleted"))
      .map((e) => e.relativePath)[0] ?? null)
    : null;
  const showReviewChangesCta = runSettled && stats.filesChanged >= 2;

  const shipSubline = qaLists?.shipState === "ready-to-ship"
    ? "Local checks passed. Human review recommended."
    : null;

  return {
    visible: true,
    tone,
    headline,
    detail,
    nextStep,
    shipState: qaLists?.shipState ?? null,
    shipLabel: qaLists?.shipLabel ?? null,
    shipSubline,
    qaPassed: qaLists?.passed,
    qaWarnings: qaLists?.warnings,
    qaSkipped: qaLists?.skipped,
    qaFailed: qaLists?.failed,
    reviewChangesPath: firstChangedPath,
    showReviewChangesCta,
    canRollback,
    rollbackRunId: canRollback ? rollbackRunId : null,
  };
}
