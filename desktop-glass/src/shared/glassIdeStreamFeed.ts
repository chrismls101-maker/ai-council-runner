/**
 * Glass IDE stream — timeline feed items (pure, testable).
 */

import type { AgentChangeLogEntry, GlassState } from "./ipc.ts";
import type { QaCheck } from "./glassQaPipeline.ts";
import { qaStatusIcon } from "./glassQaPipeline.ts";
import {
  verifyFailLabel,
  verifyPassLabel,
  verifyRunningLabel,
} from "./coderBuildLoopShared.ts";

export type GlassIdeFeedTone = "neutral" | "live" | "ok" | "warn" | "error" | "pending";

export interface GlassIdeFeedItem {
  id: string;
  tone: GlassIdeFeedTone;
  icon: string;
  label: string;
  detail?: string;
  /** Relative path for "open in editor" actions */
  relativePath?: string;
}

export interface GlassIdeStreamFeedModel {
  idle: boolean;
  idleLabel: string;
  items: GlassIdeFeedItem[];
  hasStreamOutput: boolean;
  streamCollapsedDefault: boolean;
  showQaFixAll: boolean;
  qaRunId: string | null;
}

function changeIcon(action: AgentChangeLogEntry["action"]): string {
  switch (action) {
    case "applied":
      return "✓";
    case "deleted":
      return "✕";
    case "skipped":
      return "○";
    default:
      return "!";
  }
}

function changeTone(action: AgentChangeLogEntry["action"]): GlassIdeFeedTone {
  switch (action) {
    case "applied":
      return "ok";
    case "failed":
      return "error";
    case "skipped":
      return "neutral";
    default:
      return "warn";
  }
}

function changeLabel(entry: AgentChangeLogEntry): string {
  const file = entry.relativePath.split("/").pop() || entry.relativePath;
  switch (entry.action) {
    case "applied":
      return `Changed ${file}`;
    case "deleted":
      return `Deleted ${file}`;
    case "skipped":
      return `Skipped ${file}`;
    case "failed":
      return `Failed on ${file}`;
    default:
      return file;
  }
}

function qaTone(status: QaCheck["status"]): GlassIdeFeedTone {
  switch (status) {
    case "running":
      return "live";
    case "pass":
      return "ok";
    case "warn":
      return "warn";
    case "fail":
      return "error";
    case "skipped":
      return "neutral";
    default:
      return "pending";
  }
}

export function buildGlassIdeStreamFeed(input: {
  state: GlassState;
  answer: string;
  runId: string | null;
  taskPrompt?: string;
}): GlassIdeStreamFeedModel {
  const { state, answer, runId, taskPrompt } = input;
  const items: GlassIdeFeedItem[] = [];
  const activeRunId =
    state.agentRun?.agentId === "coder" ? state.agentRun.runId : runId;
  const pending = state.agentPendingApproval;
  const showApproval = Boolean(pending && pending.runId === activeRunId);
  const agentRun = state.agentRun?.agentId === "coder" ? state.agentRun : null;
  const agentRunning = agentRun?.status === "running" && agentRun.runId === activeRunId;
  const agentDone = agentRun?.status === "done" && agentRun.runId === activeRunId;
  const agentFailed = agentRun?.status === "error" && agentRun.runId === activeRunId;
  const agentCancelled = agentRun?.status === "cancelled" && agentRun.runId === activeRunId;

  const changeLog = (state.agentChangeLog ?? []).filter((e) => {
    if (!activeRunId) return false;
    return e.runId === activeRunId;
  });

  const qaPipeline =
    state.qaPipelineState && activeRunId && state.qaPipelineState.runId === activeRunId
      ? state.qaPipelineState
      : null;

  const trimmedTask = taskPrompt?.trim();
  if (trimmedTask && (agentRunning || agentDone || agentFailed)) {
    items.push({
      id: "task",
      tone: agentRunning ? "live" : agentFailed ? "error" : "ok",
      icon: "◎",
      label: trimmedTask.length > 72 ? `${trimmedTask.slice(0, 72)}…` : trimmedTask,
      detail: trimmedTask.length > 72 ? trimmedTask : undefined,
    });
  }

  if (agentRunning) {
    items.push({
      id: "status-running",
      tone: "live",
      icon: "⟳",
      label: state.coderLoopIteration && state.coderLoopIteration > 1
        ? `Coder running (pass ${state.coderLoopIteration}/4)`
        : "Coder running",
    });
  }

  if (showApproval && pending) {
    const file = pending.relativePath.split("/").pop() || pending.relativePath;
    items.push({
      id: "approval",
      tone: "pending",
      icon: "◆",
      label: `Review ${file} in editor`,
      detail: "Apply or Skip in the editor tab",
      relativePath: pending.relativePath,
    });
  }

  const sortedChanges = [...changeLog].sort((a, b) => a.at - b.at).slice(-6);
  for (const entry of sortedChanges) {
    items.push({
      id: `change-${entry.at}-${entry.relativePath}`,
      tone: changeTone(entry.action),
      icon: changeIcon(entry.action),
      label: changeLabel(entry),
      detail: entry.error || entry.description,
      relativePath: entry.relativePath,
    });
  }

  if (qaPipeline) {
    for (const check of qaPipeline.checks) {
      if (check.status === "pending") continue;
      items.push({
        id: `qa-${check.id}`,
        tone: qaTone(check.status),
        icon: qaStatusIcon(check.status),
        label: check.label,
        detail: check.detail,
      });
    }
  }

  const verify = state.coderVerifyState;
  const showVerify = !state.glassSettings.qaModeEnabled
    && agentDone
    && verify?.runId === activeRunId
    && !showApproval;

  if (showVerify && verify) {
    if (verify.status === "running") {
      items.push({
        id: "verify",
        tone: "live",
        icon: "⟳",
        label: verifyRunningLabel(verify.command),
      });
    } else if (verify.status === "pass") {
      items.push({
        id: "verify",
        tone: "ok",
        icon: "✓",
        label: verifyPassLabel(verify.command),
      });
    } else if (verify.status === "fail") {
      items.push({
        id: "verify",
        tone: "error",
        icon: "✗",
        label: verifyFailLabel(verify.command),
        detail: verify.output?.slice(0, 240),
      });
    }
  }

  const review = state.coderReviewState;
  const showReview = !state.glassSettings.qaModeEnabled
    && agentDone
    && review?.runId === activeRunId
    && review.status !== "dismissed"
    && !showApproval;

  if (showReview && review) {
    items.push({
      id: "review",
      tone: review.status === "running" ? "live" : review.status === "done" ? "ok" : "neutral",
      icon: review.status === "running" ? "⟳" : "◎",
      label: review.status === "running"
        ? "Reviewing changes…"
        : `Review — ${review.fileCount ?? 0} file(s)`,
    });
  }

  if (agentFailed) {
    items.push({
      id: "status-error",
      tone: "error",
      icon: "✗",
      label: "Run failed",
      detail: state.lastError ?? undefined,
    });
  } else if (agentCancelled) {
    items.push({
      id: "status-cancelled",
      tone: "warn",
      icon: "■",
      label: "Stopped",
    });
  } else   if (agentDone && !showApproval && !qaPipeline?.checks.some((c) => c.status === "running")) {
    const qaFailed = qaPipeline?.checks.some((c) => c.status === "fail");
    items.push({
      id: "status-done",
      tone: qaFailed ? "warn" : "ok",
      icon: qaFailed ? "⚠" : "✓",
      label: qaFailed ? "Done — QA issues remain" : "Done",
    });
  }

  const aletheiaLine = state.glassIdeAletheia?.feedLine;
  if (
    aletheiaLine
    && !items.some((item) => item.id === aletheiaLine.id)
  ) {
    items.push({
      id: aletheiaLine.id,
      tone: aletheiaLine.tone === "ok"
        ? "ok"
        : aletheiaLine.tone === "warn"
          ? "warn"
          : "neutral",
      icon: "◇",
      label: aletheiaLine.label,
      detail: aletheiaLine.detail,
    });
  }

  const hasStreamOutput = Boolean(answer.trim());
  const hasActivity = items.length > 0 || hasStreamOutput;

  return {
    idle: !hasActivity,
    idleLabel: "Ready — describe a task below",
    items,
    hasStreamOutput,
    streamCollapsedDefault: true,
    showQaFixAll: Boolean(
      qaPipeline && qaPipeline.checks.some((c) => c.status === "fail"),
    ),
    qaRunId: qaPipeline?.runId ?? null,
  };
}
