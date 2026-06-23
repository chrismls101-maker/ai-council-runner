import { useEffect, useMemo, useState } from "react";
import type { AgentChangeLogEntry, GlassState } from "../../shared/ipc.ts";
import { GlassDiffView } from "../components/GlassDiffView.tsx";
import { GlassQaBoard } from "./GlassQaBoard.tsx";
import { ensureOverlayInteractive, handlePaletteListWheel } from "../glassTextInteraction.ts";
import { parseMarkdown } from "./GlassResponsePanel.tsx";
import {
  verifyFailLabel,
  verifyPassLabel,
  verifyRunningLabel,
} from "../../shared/coderBuildLoopShared.ts";
import "./GlassCoderPanel.css";

export function coderStreamStatusLabel(
  agentRun: GlassState["agentRun"],
  pending: GlassState["agentPendingApproval"],
  activeRunId: string | null,
  loopIteration?: number,
): string {
  const loopSuffix = loopIteration && loopIteration > 1
    ? ` (pass ${loopIteration}/4)`
    : "";
  if (pending && activeRunId && pending.runId === activeRunId) return `Waiting for approval…${loopSuffix}`;
  if (agentRun?.status === "running") return `Running…${loopSuffix}`;
  if (agentRun?.status === "done") return `Done${loopSuffix}`;
  if (agentRun?.status === "error") return `Failed${loopSuffix}`;
  if (agentRun?.status === "cancelled") return `Stopped${loopSuffix}`;
  return loopIteration && loopIteration > 1 ? `Glass Coder (pass ${loopIteration}/4)` : "Glass Coder";
}

function interactivePointerProps(): {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerEnter: () => void;
} {
  return {
    onPointerDown: (e) => {
      e.stopPropagation();
      ensureOverlayInteractive();
    },
    onPointerEnter: ensureOverlayInteractive,
  };
}

export interface GlassCoderStreamProps {
  state: GlassState;
  answer: string;
  prompt: string;
  runId: string | null;
  /** When true, omits outer prompt row (e.g. task shown in IDE chat). */
  hidePrompt?: boolean;
  showCopy?: boolean;
  emptyHint?: string;
  /** When set, changelog Show opens in IDE file viewer instead of Finder. */
  onOpenFile?: (relativePath: string) => void;
}

export function GlassCoderStream({
  state,
  answer,
  prompt,
  runId,
  hidePrompt = false,
  showCopy = true,
  emptyHint,
  onOpenFile,
}: GlassCoderStreamProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  const pending = state.agentPendingApproval;
  const activeRunId =
    state.agentRun?.agentId === "coder" ? state.agentRun.runId : runId;
  const showApproval = pending && pending.runId === activeRunId;
  const changeLog = (state.agentChangeLog ?? []).filter((e) => {
    const id = state.agentRun?.agentId === "coder" ? state.agentRun.runId : runId;
    return !id || e.runId === id;
  });
  const agentDone = state.agentRun?.agentId === "coder"
    && state.agentRun.status === "done"
    && state.agentRun.runId === activeRunId;
  const showVerify = !state.glassSettings.qaModeEnabled
    && agentDone
    && state.coderVerifyState?.runId === activeRunId
    && !showApproval;
  const showReview = !state.glassSettings.qaModeEnabled
    && agentDone
    && state.coderReviewState?.runId === activeRunId
    && state.coderReviewState.status !== "dismissed"
    && !showApproval;
  const qaPipeline = state.qaPipelineState
    && activeRunId
    && state.qaPipelineState.runId === activeRunId
    ? state.qaPipelineState
    : null;
  const reviewRendered = useMemo(
    () => (state.coderReviewState?.findings ? parseMarkdown(state.coderReviewState.findings) : ""),
    [state.coderReviewState?.findings],
  );
  const rendered = useMemo(() => parseMarkdown(answer), [answer]);
  const hasActivity = Boolean(
    answer.trim()
    || showApproval
    || changeLog.length > 0
    || showVerify
    || showReview
    || qaPipeline
    || (state.agentRun?.agentId === "coder" && state.agentRun.status === "running"),
  );

  useEffect(() => {
    setCopied(false);
  }, [answer, runId]);

  const handleApprove = (approved: boolean): void => {
    const approveRunId = state.agentRun?.runId ?? runId;
    if (!pending || !approveRunId || pending.runId !== approveRunId) return;
    void window.glass.agentApprove({
      runId: approveRunId,
      pendingToolId: pending.pendingToolId,
      approved,
    });
  };

  const copyAnswer = (): void => {
    if (!answer) return;
    void window.glass.writeClipboard(answer).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  const revealPath = (path: string, relativePath: string): void => {
    if (onOpenFile) {
      onOpenFile(relativePath || path);
      return;
    }
    void window.glass.agentRevealPath(path);
  };

  const restoreBackup = (path: string): void => {
    void window.glass.agentRestoreBackup(path);
  };

  return (
    <div className="gcp-stream" data-testid="glass-coder-stream">
      {!hidePrompt && prompt ? (
        <div className="gcp-prompt" title={prompt}>{prompt}</div>
      ) : null}

      {showApproval && state.glassIdeActive ? (
        <div className="gcp-approval gcp-approval--ide-delegate" data-testid="glass-coder-approval-delegate">
          <span className="gcp-approval__path">{pending.relativePath}</span>
          <span className="gcp-approval__desc">
            Review inline in the editor — Apply or Skip there.
          </span>
        </div>
      ) : null}

      {showApproval && !state.glassIdeActive ? (
        <div
          className={`gcp-approval${pending.isDelete ? " gcp-approval--delete" : ""}`}
          data-testid="glass-coder-approval"
        >
          <div className="gcp-approval__head">
            <span className="gcp-approval__path">{pending.relativePath}</span>
            <span className="gcp-approval__desc">{pending.description}</span>
            {pending.isDelete ? (
              <span className="gcp-approval__warning">
                This file will be moved to Trash. This cannot be undone from Glass.
              </span>
            ) : null}
          </div>
          <div className="gcp-approval__diff">
            <GlassDiffView lines={pending.displayLines} />
          </div>
          <div className="gcp-approval__actions">
            <button
              type="button"
              className={`gcp-btn gcp-btn--primary${pending.isDelete ? " gcp-btn--danger" : ""}`}
              onClick={() => handleApprove(true)}
              {...interactivePointerProps()}
            >
              {pending.isDelete ? "Delete" : "Apply"}
            </button>
            <button
              type="button"
              className="gcp-btn"
              onClick={() => handleApprove(false)}
              {...interactivePointerProps()}
            >
              Skip
            </button>
          </div>
        </div>
      ) : null}

      <div className="gcp-content gcp-stream__content" onWheel={handlePaletteListWheel}>
        {rendered}
        {!hasActivity && emptyHint ? (
          <p className="gcp-stream__empty">{emptyHint}</p>
        ) : null}
      </div>

      {changeLog.length > 0 ? (
        <div className="gcp-changelog">
          <div className="gcp-changelog__title">Changes</div>
          {changeLog.map((entry: AgentChangeLogEntry, idx) => (
            <div key={`${entry.path}-${entry.at}-${idx}`} className={`gcp-changelog__item gcp-changelog__item--${entry.action}`}>
              <span className="gcp-changelog__label">
                {entry.action === "applied" ? "✓" : entry.action === "deleted" ? "✕" : entry.action === "skipped" ? "○" : "!"}{" "}
                {entry.relativePath}
              </span>
              <div className="gcp-changelog__actions">
                {entry.action === "applied" && entry.backupPath ? (
                  <button
                    type="button"
                    className="gcp-changelog__reveal"
                    onClick={() => restoreBackup(entry.path)}
                    {...interactivePointerProps()}
                  >
                    Restore
                  </button>
                ) : null}
                <button
                  type="button"
                  className="gcp-changelog__reveal"
                  onClick={() => revealPath(entry.path, entry.relativePath)}
                  {...interactivePointerProps()}
                >
                  Show
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {qaPipeline ? (
        <GlassQaBoard
          runId={qaPipeline.runId}
          checks={qaPipeline.checks}
          autoFix={qaPipeline.autoFix}
          onFixAll={() => {
            void window.glass.qaPipelineFixAll({ runId: qaPipeline.runId });
          }}
        />
      ) : null}

      {showVerify ? (
        <div className="gcp-verify" data-testid="glass-coder-verify">
          {state.coderVerifyState?.status === "running" ? (
            <span className="gcp-verify__status gcp-verify__status--running">
              ⟳ {verifyRunningLabel(state.coderVerifyState.command)}
            </span>
          ) : null}
          {state.coderVerifyState?.status === "pass" ? (
            <span className="gcp-verify__status gcp-verify__status--pass">
              {verifyPassLabel(state.coderVerifyState.command)}
            </span>
          ) : null}
          {state.coderVerifyState?.status === "fail" ? (
            <>
              <span className="gcp-verify__status gcp-verify__status--fail">
                {verifyFailLabel(state.coderVerifyState.command)}
              </span>
              <pre className="gcp-verify__output">{state.coderVerifyState.output}</pre>
              <button
                type="button"
                className="gcp-btn gcp-btn--primary"
                {...interactivePointerProps()}
                onClick={() => {
                  if (!activeRunId || !state.coderVerifyState?.output) return;
                  void window.glass.coderVerifyFix({
                    runId: activeRunId,
                    errorOutput: state.coderVerifyState.output,
                  });
                }}
              >
                Fix errors
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {showReview ? (
        <div className="gcp-review" data-testid="glass-coder-review">
          <div className="gcp-review__header">
            <span className="gcp-review__icon">◎</span>
            <span className="gcp-review__label">
              {state.coderReviewState?.status === "running"
                ? "Reviewing changes…"
                : `Code Review — ${state.coderReviewState?.fileCount ?? 0} file(s)`}
            </span>
          </div>
          {state.coderReviewState?.status === "done" && state.coderReviewState.findings ? (
            <>
              <div className="gcp-review__body glass-selectable-text">
                {reviewRendered}
              </div>
              <div className="gcp-review__actions">
                <button
                  type="button"
                  className="gcp-btn gcp-btn--primary"
                  {...interactivePointerProps()}
                  onClick={() => {
                    if (!activeRunId || !state.coderReviewState?.findings) return;
                    void window.glass.coderReviewFix({
                      runId: activeRunId,
                      findings: state.coderReviewState.findings,
                    });
                  }}
                >
                  Fix with Glass
                </button>
                <button
                  type="button"
                  className="gcp-btn"
                  {...interactivePointerProps()}
                  onClick={() => window.glass.coderReviewDismiss()}
                >
                  Dismiss
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {showCopy ? (
        <div className="gcp-footer">
          <button type="button" className="gcp-btn gcp-btn--primary" onClick={copyAnswer} {...interactivePointerProps()}>
            {copied ? "Copied!" : "Copy answer"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
