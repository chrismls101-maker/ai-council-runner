/**
 * Glass IDE — enriched run header for the stream pane.
 */

import type { AgentHistoryEntry, GlassState } from "./ipc.ts";
import { resolveCoderAgentModelId, resolveCoderAgentModelDef } from "./coderAgentModels.ts";
import type { CoderTranscriptItem } from "./glassIdeCoderTranscript.ts";
import {
  coderRunPhaseLabel,
  deriveCoderRunPhase,
  type CoderRunPhase,
} from "./glassIdeRunPhase.ts";
import { coderStreamStatusLabel } from "./glassIdeStreamStatus.ts";

import { deriveGlassIdeReviewShelf, type GlassIdeReviewFileChip } from "./glassIdeReviewShelf.ts";
import { qaProgressCounters } from "./glassQaPipeline.ts";
import { canRollbackRun } from "./coderCheckpoints.ts";

export type { GlassIdeReviewFileChip };

export interface GlassIdeRunHeaderModel {
  visible: boolean;
  taskLabel: string | null;
  modelLabel: string;
  phase: CoderRunPhase | null;
  phaseLabel: string | null;
  elapsedLabel: string | null;
  statusLabel: string;
  showStop: boolean;
  approvalPending: boolean;
  /** Wireframe-1 run stats: "2 files touched · 1 pending" */
  runStatsLine: string | null;
  openNextPath: string | null;
  touchedFiles: GlassIdeReviewFileChip[];
  qaProgressLine: string | null;
  failedCheckCount: number;
  showTrustEdits: boolean;
  canRollback: boolean;
  rollbackRunId: string | null;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

function findRunStartedAt(
  runId: string | null,
  history: AgentHistoryEntry[] | undefined,
): number | null {
  if (!runId || !history?.length) return null;
  const entry = history.find((h) => h.runId === runId && h.agentId === "coder");
  return entry?.startedAt ?? null;
}

export function deriveGlassIdeRunHeader(input: {
  state: Pick<
    GlassState,
    | "agentRun"
    | "agentPendingApproval"
    | "agentHistory"
    | "coderVerifyState"
    | "qaPipelineState"
    | "coderLoopIteration"
    | "coderRunUsage"
    | "glassSettings"
    | "coderCheckpoints"
    | "coderLoopSessionId"
  >;
  runId: string | null;
  taskPrompt?: string;
  transcript: CoderTranscriptItem[];
  nowMs?: number;
}): GlassIdeRunHeaderModel {
  const { state, runId, taskPrompt, transcript } = input;
  const nowMs = input.nowMs ?? Date.now();
  const activeRunId =
    state.agentRun?.agentId === "coder" ? state.agentRun.runId : runId;

  const agentRun = state.agentRun?.agentId === "coder" ? state.agentRun : null;
  const agentRunning = agentRun?.status === "running" && agentRun.runId === activeRunId;
  const agentDone = agentRun?.status === "done" && agentRun.runId === activeRunId;
  const agentFailed = agentRun?.status === "error" && agentRun.runId === activeRunId;

  const pending = state.agentPendingApproval;
  const approvalPending = Boolean(
    pending?.agentId === "coder"
    && activeRunId
    && pending.runId === activeRunId
    && agentRunning,
  );

  const verify = state.coderVerifyState;
  const verifyActive = verify?.runId === activeRunId ? verify.status : "idle";
  const qa = state.qaPipelineState?.runId === activeRunId ? state.qaPipelineState : null;
  const qaRunning = Boolean(qa?.checks.some((c) => c.status === "running"));
  const qaWaiting = qa?.status === "waiting";

  const phase = deriveCoderRunPhase({
    agentRunning,
    agentDone,
    agentFailed,
    approvalPending,
    loopIteration: state.coderLoopIteration,
    verifyStatus: verifyActive === "idle" ? undefined : verifyActive,
    qaRunning: qaRunning || qaWaiting,
    transcript,
  });

  const trimmedTask = taskPrompt?.trim()
    || agentRun?.prompt?.trim()
    || null;
  const taskLabel = trimmedTask
    ? (trimmedTask.length > 56 ? `${trimmedTask.slice(0, 56)}…` : trimmedTask)
    : null;

  const usage = state.coderRunUsage?.runId === activeRunId ? state.coderRunUsage : null;
  const runPrompt = trimmedTask ?? agentRun?.prompt ?? "";
  const settingsModelId = resolveCoderAgentModelId(state.glassSettings.coderAgentModel);
  const modelId = usage?.modelId ?? settingsModelId;
  const modelLabel = usage?.label
    ?? (modelId === "auto"
      ? `Auto · ${resolveCoderAgentModelDef(modelId, runPrompt).label}`
      : resolveCoderAgentModelDef(modelId, runPrompt).label);

  const startedAt = findRunStartedAt(activeRunId, state.agentHistory);
  const elapsedLabel = startedAt ? formatElapsed(nowMs - startedAt) : null;

  const statusLabel = coderStreamStatusLabel(
    agentRun,
    pending ?? null,
    activeRunId,
    state.coderLoopIteration,
  );

  const visible = Boolean(
    activeRunId
    && (agentRunning || agentDone || agentFailed || approvalPending
      || verifyActive === "running" || qaRunning || qaWaiting),
  );

  const shelf = deriveGlassIdeReviewShelf({
    transcript,
    state,
    runId,
  });

  const qaProgressLine = qa
    ? (qa.status === "waiting"
      ? `QA waiting · ${qa.pendingApprovalCount ?? 1} approval${(qa.pendingApprovalCount ?? 1) === 1 ? "" : "s"} unresolved`
      : qaProgressCounters(qa.checks).summaryLine)
    : null;

  const rollbackRunId = state.coderLoopSessionId ?? activeRunId;
  const canRollback = canRollbackRun(state.coderCheckpoints, rollbackRunId);
  const showTrustEdits = approvalPending
    && !state.agentPendingApproval?.isDelete
    && shelf.touchedFiles.filter((f) => f.status === "pending" || f.status === "applied").length >= 2;

  return {
    visible: visible || shelf.visible,
    taskLabel,
    modelLabel,
    phase,
    phaseLabel: phase ? coderRunPhaseLabel(phase) : null,
    elapsedLabel,
    statusLabel,
    showStop: agentRunning,
    approvalPending,
    runStatsLine: shelf.visible ? shelf.summaryLine : null,
    openNextPath: shelf.openNextPath,
    touchedFiles: shelf.touchedFiles,
    failedCheckCount: shelf.failedCheckCount,
    qaProgressLine,
    showTrustEdits,
    canRollback,
    rollbackRunId: canRollback ? rollbackRunId : null,
  };
}
