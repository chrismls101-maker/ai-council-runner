/**
 * Glass IDE stream — Wireframe 3 active focus card (pin what needs attention now).
 */

import type { CoderTranscriptCollapsedDisplayItem } from "./glassIdeTranscriptCollapse.ts";
import { isCoderWriteTool } from "./glassIdeCoderTranscript.ts";
import type { GlassState } from "./ipc.ts";
import { pathsMatchRelative } from "./glassIdeInlineDiff.ts";
import {
  formatCoderRunUsageLine,
} from "./coderAgentModels.ts";

export type GlassIdeActiveFocusTone = "pending" | "running" | "error" | "recover";

export interface GlassIdeActiveFocusModel {
  visible: boolean;
  tone: GlassIdeActiveFocusTone;
  eyebrow: string;
  title: string;
  detail: string | null;
  relativePath: string | null;
  sourceItemId: string | null;
  usageLine: string | null;
  /** Show graduated approval — trust all pending edits for this run. */
  showTrustEdits: boolean;
  runId: string | null;
}

export interface GlassIdeChangesetSummary {
  visible: boolean;
  headline: string;
  detail: string | null;
}

function resolveActiveRunId(
  state: Pick<GlassState, "agentRun">,
  runId: string | null,
): string | null {
  return state.agentRun?.agentId === "coder" ? state.agentRun.runId : runId;
}

function pendingFocus(
  pending: NonNullable<GlassState["agentPendingApproval"]>,
  multiFilePending: boolean,
): GlassIdeActiveFocusModel {
  return {
    visible: true,
    tone: "pending",
    eyebrow: "Needs approval",
    title: pending.relativePath,
    detail: pending.description || (pending.isDelete ? "Delete this file?" : "Review the diff below"),
    relativePath: pending.relativePath,
    sourceItemId: null,
    usageLine: null,
    showTrustEdits: multiFilePending && !pending.isDelete,
    runId: pending.runId,
  };
}

export function deriveGlassIdeActiveFocus(input: {
  displayItems: CoderTranscriptCollapsedDisplayItem[];
  state: Pick<GlassState, "agentRun" | "agentPendingApproval" | "coderRunUsage">;
  runId: string | null;
  agentRunning: boolean;
}): GlassIdeActiveFocusModel {
  const { displayItems, state, runId, agentRunning } = input;
  const activeRunId = resolveActiveRunId(state, runId);
  const pending = state.agentPendingApproval;
  const usageLine = state.coderRunUsage
    ? formatCoderRunUsageLine(state.coderRunUsage)
    : agentRunning
      ? "Measuring usage…"
      : null;

  const pendingWriteCount = displayItems.filter(
    (item) => item.kind === "tool"
      && isCoderWriteTool(item.toolName)
      && (item.status === "done" || item.status === "running"),
  ).length;
  const multiFilePending = pendingWriteCount >= 2;

  if (
    pending
    && pending.agentId === "coder"
    && activeRunId
    && pending.runId === activeRunId
  ) {
    return { ...pendingFocus(pending, multiFilePending), usageLine };
  }

  if (!agentRunning && !pending) {
    return {
      visible: false,
      tone: "running",
      eyebrow: "",
      title: "",
      detail: null,
      relativePath: null,
      sourceItemId: null,
      usageLine: null,
      showTrustEdits: false,
      runId: null,
    };
  }

  for (let i = displayItems.length - 1; i >= 0; i -= 1) {
    const item = displayItems[i];
    if (item.kind === "verify") {
      if (item.status === "fail" || item.status === "warn") {
        return {
          visible: true,
          tone: "error",
          eyebrow: "Verification failed",
          title: item.label,
          detail: item.output?.split("\n")[0] ?? item.command ?? null,
          relativePath: null,
          sourceItemId: item.id,
          usageLine,
          showTrustEdits: false,
          runId: activeRunId,
        };
      }
      if (item.status === "running") {
        return {
          visible: true,
          tone: "running",
          eyebrow: "Verifying",
          title: item.label,
          detail: item.command ?? null,
          relativePath: null,
          sourceItemId: item.id,
          usageLine,
          showTrustEdits: false,
          runId: activeRunId,
        };
      }
    }

    if (item.kind === "tool" && item.toolName === "run_project_command") {
      const failed = item.status === "error"
        || (item.exitCode != null && item.exitCode !== 0 && item.status !== "running");
      if (failed) {
        return {
          visible: true,
          tone: "recover",
          eyebrow: "Command failed",
          title: item.command ?? item.label,
          detail: item.exitCode != null ? `Exit ${item.exitCode}` : item.result ?? null,
          relativePath: null,
          sourceItemId: item.id,
          usageLine,
          showTrustEdits: false,
          runId: activeRunId,
        };
      }
      if (item.status === "running") {
        return {
          visible: true,
          tone: "running",
          eyebrow: "Running command",
          title: item.command ?? item.label,
          detail: item.commandCwd ?? null,
          relativePath: null,
          sourceItemId: item.id,
          usageLine,
          showTrustEdits: false,
          runId: activeRunId,
        };
      }
    }

    if (item.kind === "tool" && isCoderWriteTool(item.toolName) && item.status === "running") {
      return {
        visible: true,
        tone: "running",
        eyebrow: "Editing",
        title: item.relativePath ?? item.label,
        detail: item.label,
        relativePath: item.relativePath ?? null,
        sourceItemId: item.id,
        usageLine,
        showTrustEdits: false,
        runId: activeRunId,
      };
    }
  }

  if (agentRunning) {
    return {
      visible: true,
      tone: "running",
      eyebrow: "Coder running",
      title: "Working on your task",
      detail: null,
      relativePath: null,
      sourceItemId: null,
      usageLine,
      showTrustEdits: false,
      runId: activeRunId,
    };
  }

  return {
    visible: false,
    tone: "running",
    eyebrow: "",
    title: "",
    detail: null,
    relativePath: null,
    sourceItemId: null,
    usageLine: null,
    showTrustEdits: false,
    runId: null,
  };
}

export function deriveGlassIdeChangesetSummary(input: {
  touchedFiles: Array<{ relativePath: string; fileName: string; added: number; removed: number; status: string }>;
}): GlassIdeChangesetSummary {
  const { touchedFiles } = input;
  if (touchedFiles.length === 0) {
    return { visible: false, headline: "", detail: null };
  }

  const applied = touchedFiles.filter((f) => f.status === "applied").length;
  const pending = touchedFiles.filter((f) => f.status === "pending").length;
  const failed = touchedFiles.filter((f) => f.status === "failed").length;

  const parts: string[] = [`${touchedFiles.length} file${touchedFiles.length === 1 ? "" : "s"}`];
  if (applied > 0) parts.push(`${applied} applied`);
  if (pending > 0) parts.push(`${pending} pending`);
  if (failed > 0) parts.push(`${failed} failed`);

  const totalAdded = touchedFiles.reduce((sum, f) => sum + f.added, 0);
  const totalRemoved = touchedFiles.reduce((sum, f) => sum + f.removed, 0);
  const diffPart =
    totalAdded > 0 || totalRemoved > 0
      ? `+${totalAdded} / −${totalRemoved} lines`
      : null;

  return {
    visible: true,
    headline: parts.join(" · "),
    detail: diffPart,
  };
}
