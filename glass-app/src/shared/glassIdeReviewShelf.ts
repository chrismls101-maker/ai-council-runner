/**
 * Glass IDE — sticky review shelf (touched files, pending approvals, failed checks).
 */

import type { AgentChangeLogEntry, GlassState } from "./ipc.ts";
import type { CoderTranscriptItem } from "./glassIdeCoderTranscript.ts";
import { isCoderWriteTool, languageLabelFromPath } from "./glassIdeCoderTranscript.ts";

export type ReviewFileStatus = "pending" | "running" | "applied" | "skipped" | "failed";

export interface GlassIdeReviewFileChip {
  relativePath: string;
  fileName: string;
  added: number;
  removed: number;
  status: ReviewFileStatus;
  languageLabel?: string;
}

export interface GlassIdeReviewShelfModel {
  visible: boolean;
  touchedFiles: GlassIdeReviewFileChip[];
  pendingCount: number;
  failedCheckCount: number;
  openNextPath: string | null;
  summaryLine: string;
}

function basename(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 1] || filePath;
}

function changeLogStatus(action: AgentChangeLogEntry["action"]): ReviewFileStatus {
  switch (action) {
    case "applied":
    case "deleted":
      return "applied";
    case "skipped":
      return "skipped";
    case "failed":
      return "failed";
    default:
      return "applied";
  }
}

function mergeFileChip(
  map: Map<string, GlassIdeReviewFileChip>,
  relativePath: string,
  patch: Partial<GlassIdeReviewFileChip> & { status: ReviewFileStatus },
): void {
  const existing = map.get(relativePath);
  const fileName = basename(relativePath);
  map.set(relativePath, {
    relativePath,
    fileName,
    added: patch.added ?? existing?.added ?? 0,
    removed: patch.removed ?? existing?.removed ?? 0,
    status: patch.status,
    languageLabel: patch.languageLabel ?? existing?.languageLabel ?? languageLabelFromPath(relativePath),
  });
}

export function deriveGlassIdeReviewShelf(input: {
  transcript: CoderTranscriptItem[];
  state: Pick<
    GlassState,
    | "agentRun"
    | "agentPendingApproval"
    | "agentChangeLog"
    | "coderVerifyState"
    | "qaPipelineState"
    | "glassSettings"
  >;
  runId: string | null;
}): GlassIdeReviewShelfModel {
  const { transcript, state, runId } = input;
  const activeRunId =
    state.agentRun?.agentId === "coder" ? state.agentRun.runId : runId;

  const fileMap = new Map<string, GlassIdeReviewFileChip>();

  for (const item of transcript) {
    if (item.kind !== "tool" || !item.relativePath || !isCoderWriteTool(item.toolName)) continue;
    const status: ReviewFileStatus =
      item.status === "running" ? "running"
        : item.status === "error" ? "failed"
          : item.status === "skipped" ? "skipped"
            : "applied";
    mergeFileChip(fileMap, item.relativePath, {
      status,
      added: item.diff?.added ?? 0,
      removed: item.diff?.removed ?? 0,
      languageLabel: item.languageLabel,
    });
  }

  const changeLog = (state.agentChangeLog ?? []).filter(
    (entry) => activeRunId && entry.runId === activeRunId,
  );
  for (const entry of changeLog) {
    mergeFileChip(fileMap, entry.relativePath, {
      status: changeLogStatus(entry.action),
    });
  }

  const pending = state.agentPendingApproval;
  const showApproval = Boolean(
    pending
    && pending.agentId === "coder"
    && activeRunId
    && pending.runId === activeRunId,
  );
  if (showApproval && pending) {
    mergeFileChip(fileMap, pending.relativePath, {
      status: "pending",
      added: pending.diff?.added ?? 0,
      removed: pending.diff?.removed ?? 0,
      languageLabel: languageLabelFromPath(pending.relativePath),
    });
  }

  const touchedFiles = [...fileMap.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const pendingCount = touchedFiles.filter((f) => f.status === "pending" || f.status === "running").length;

  let failedCheckCount = 0;
  const verify = state.coderVerifyState;
  if (verify?.runId === activeRunId && verify.status === "fail") {
    failedCheckCount += 1;
  }
  const qa = state.qaPipelineState;
  if (qa?.runId === activeRunId) {
    failedCheckCount += qa.checks.filter((c) => c.status === "fail").length;
  }

  const openNextPath =
    showApproval && pending
      ? pending.relativePath
      : touchedFiles.find((f) => f.status === "failed")?.relativePath
        ?? touchedFiles.find((f) => f.status === "pending")?.relativePath
        ?? null;

  const fileCount = touchedFiles.length;
  const parts: string[] = [];
  if (fileCount > 0) {
    parts.push(`${fileCount} file${fileCount === 1 ? "" : "s"} touched`);
  }
  if (pendingCount > 0) {
    parts.push(`${pendingCount} pending`);
  }
  if (failedCheckCount > 0) {
    parts.push(`${failedCheckCount} check${failedCheckCount === 1 ? "" : "s"} failed`);
  }

  const agentActive =
    state.agentRun?.agentId === "coder"
    && (state.agentRun.status === "running" || state.agentRun.status === "done" || state.agentRun.status === "error");

  const visible = agentActive && (fileCount > 0 || failedCheckCount > 0 || showApproval);

  return {
    visible,
    touchedFiles,
    pendingCount,
    failedCheckCount,
    openNextPath,
    summaryLine: parts.length > 0 ? parts.join(" · ") : "No changes yet",
  };
}
