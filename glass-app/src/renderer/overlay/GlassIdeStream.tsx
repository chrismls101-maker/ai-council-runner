/**
 * Glass IDE — live Coder transcript (Cursor-style reasoning + tool calls).
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { DiffLine } from "../../shared/diff.ts";
import type { GlassState } from "../../shared/ipc.ts";
import { buildGlassIdeStreamFeed } from "../../shared/glassIdeStreamFeed.ts";
import {
  coderTranscriptHasContent,
  mergeCoderTranscriptDisplayItems,
  type CoderTranscriptItem,
} from "../../shared/glassIdeCoderTranscript.ts";
import { deriveGlassIdeRunHeader } from "../../shared/glassIdeRunHeader.ts";
import { getActiveCoderRunId } from "../../shared/glassIdeInlineDiff.ts";
import {
  deriveGlassIdeActiveFocus,
  deriveGlassIdeChangesetSummary,
} from "../../shared/glassIdeActiveFocus.ts";
import { injectTranscriptPhaseMarkers } from "../../shared/glassIdeTranscriptPhaseDividers.ts";
import {
  deriveGlassIdeCompletionCard,
  deriveGlassIdeTrustLedger,
} from "../../shared/glassIdeRunSummary.ts";
import { ensureOverlayInteractive, handlePaletteListWheel } from "../glassTextInteraction.ts";
import { parseMarkdown } from "./GlassResponsePanel.tsx";
import { GlassIdeTranscriptToolCard } from "./GlassIdeTranscriptToolCard.tsx";
import { GlassIdeTranscriptVerifyCard } from "./GlassIdeTranscriptVerifyCard.tsx";
import { GlassIdeQaActions } from "./GlassIdeQaActions.tsx";
import { GlassIdeQaRecovery } from "./GlassIdeQaRecovery.tsx";
import { GlassIdeTranscriptInspectCluster } from "./GlassIdeTranscriptInspectCluster.tsx";
import { GlassIdeTranscriptReasoning } from "./GlassIdeTranscriptReasoning.tsx";
import { GlassIdeRunHeader } from "./GlassIdeRunHeader.tsx";
import { GlassIdeTrustLedger } from "./GlassIdeTrustLedger.tsx";
import { GlassIdeCompletionCard } from "./GlassIdeCompletionCard.tsx";
import { GlassIdeActiveFocusCard } from "./GlassIdeActiveFocusCard.tsx";
import { GlassIdeChangesetPanel } from "./GlassIdeChangesetPanel.tsx";
import { GlassIdeTranscriptPhaseDivider } from "./GlassIdeTranscriptPhaseDivider.tsx";
import "./GlassResponsePanel.css";
import "./GlassIdeStream.css";

export interface GlassIdeStreamProps {
  state: GlassState;
  transcript: CoderTranscriptItem[];
  answer: string;
  runId: string | null;
  taskPrompt?: string;
  onOpenFile?: (relativePath: string, displayLines?: DiffLine[]) => void;
  onStop?: () => void;
  onPrefillComposer?: (text: string) => void;
  onSendPrompt?: (text: string) => void;
}

function ThinkingRow(): JSX.Element {
  return (
    <div className="gide-transcript__thinking" aria-live="polite">
      <span className="gide-transcript__thinking-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>Thinking</span>
    </div>
  );
}

function TranscriptStatusRow({ text }: { text: string }): JSX.Element {
  return (
    <div className="gide-transcript__activity">
      <span className="gide-transcript__activity-dot" aria-hidden="true" />
      <span className="gide-transcript__activity-text">{text}</span>
    </div>
  );
}

export function GlassIdeStream({
  state,
  transcript,
  answer,
  runId,
  taskPrompt,
  onOpenFile,
  onStop,
  onPrefillComposer,
  onSendPrompt,
}: GlassIdeStreamProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const changesetRef = useRef<HTMLDetailsElement>(null);
  const agentRunning = state.agentRun?.agentId === "coder" && state.agentRun.status === "running";
  const feed = useMemo(
    () => buildGlassIdeStreamFeed({ state, answer, runId, taskPrompt }),
    [state, answer, runId, taskPrompt],
  );

  const runHeader = useMemo(
    () => deriveGlassIdeRunHeader({ state, runId, taskPrompt, transcript }),
    [state, runId, taskPrompt, transcript],
  );

  const activeRunId = useMemo(
    () => getActiveCoderRunId(state, runId),
    [state, runId],
  );

  const trustLedger = useMemo(
    () => deriveGlassIdeTrustLedger({ transcript, state, runId }),
    [transcript, state, runId],
  );

  const completionCard = useMemo(
    () => deriveGlassIdeCompletionCard({ transcript, state, runId }),
    [transcript, state, runId],
  );

  const displayItems = useMemo(
    () => mergeCoderTranscriptDisplayItems(transcript, state, runId),
    [transcript, state, runId],
  );

  const streamItems = useMemo(
    () => injectTranscriptPhaseMarkers(displayItems, {
      pendingApproval: state.agentPendingApproval,
      activeRunId,
    }),
    [displayItems, state.agentPendingApproval, activeRunId],
  );

  const activeFocus = useMemo(
    () => deriveGlassIdeActiveFocus({
      displayItems,
      state,
      runId,
      agentRunning,
    }),
    [displayItems, state, runId, agentRunning],
  );

  const changesetSummary = useMemo(
    () => deriveGlassIdeChangesetSummary({ touchedFiles: runHeader.touchedFiles }),
    [runHeader.touchedFiles],
  );

  const showTranscript = coderTranscriptHasContent(transcript) || agentRunning
    || displayItems.some((item) => item.kind === "verify");

  const changesetDefaultOpen = useMemo(
    () => completionCard.showReviewChangesCta
      || (!agentRunning && runHeader.touchedFiles.length >= 2 && completionCard.visible),
    [agentRunning, completionCard.showReviewChangesCta, completionCard.visible, runHeader.touchedFiles.length],
  );

  const handleTrustEdits = useCallback((runId: string): void => {
    void window.glass.agentSetApprovalMode({ runId, mode: "trust_edits" });
  }, []);

  const handleRollback = useCallback((runId: string): void => {
    void window.glass.coderRollbackCheckpoint({ runId });
  }, []);

  const handleReviewChanges = useCallback((): void => {
    const el = changesetRef.current ?? document.querySelector<HTMLDetailsElement>(
      "[data-testid='glass-ide-changeset']",
    );
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (completionCard.reviewChangesPath && onOpenFile) {
      onOpenFile(completionCard.reviewChangesPath);
    }
  }, [completionCard.reviewChangesPath, onOpenFile]);

  const lastTextId = useMemo(() => {
    for (let i = displayItems.length - 1; i >= 0; i -= 1) {
      const item = displayItems[i];
      if (item.kind === "text" && item.text.trim()) return item.id;
    }
    return null;
  }, [displayItems]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [streamItems, answer, agentRunning]);

  return (
    <div className="gide-ide-feed" data-testid="glass-ide-stream">
      <GlassIdeRunHeader
        header={runHeader}
        onStop={onStop}
        onOpenFile={onOpenFile}
        onTrustEdits={handleTrustEdits}
        onRollback={handleRollback}
        activeRunId={activeRunId}
      />
      {state.qaRiskTriggered && state.qaRiskPaths?.length ? (
        <p className="gide-qa-risk-chip" data-testid="glass-ide-qa-risk-chip">
          QA Mode auto-enabled — risky paths: {state.qaRiskPaths.slice(0, 3).join(", ")}
          {state.qaRiskPaths.length > 3 ? ` +${state.qaRiskPaths.length - 3} more` : ""}
        </p>
      ) : null}
      <GlassIdeActiveFocusCard
        focus={activeFocus}
        onOpenFile={onOpenFile}
        onTrustEdits={handleTrustEdits}
      />
      <GlassIdeChangesetPanel
        ref={changesetRef}
        summary={changesetSummary}
        files={runHeader.touchedFiles}
        onOpenFile={onOpenFile}
        defaultOpen={changesetDefaultOpen}
      />
      <GlassIdeTrustLedger
        ledger={{
          ...trustLedger,
          visible: trustLedger.visible && runHeader.touchedFiles.length === 0,
        }}
      />
      {showTranscript ? (
        <div
          className="gide-transcript"
          ref={scrollRef}
          onWheel={handlePaletteListWheel}
          data-testid="glass-ide-transcript"
        >
          {streamItems.length === 0 && agentRunning ? <ThinkingRow /> : null}
          {streamItems.map((item) => {
            if (item.kind === "phase-marker") {
              return <GlassIdeTranscriptPhaseDivider key={item.id} marker={item} />;
            }
            if (item.kind === "inspect-cluster") {
              return (
                <GlassIdeTranscriptInspectCluster
                  key={item.id}
                  item={item}
                  onOpenFile={onOpenFile}
                />
              );
            }
            if (item.kind === "text-collapsed") {
              return <GlassIdeTranscriptReasoning key={item.id} item={item} />;
            }
            if (item.kind === "status") {
              return <TranscriptStatusRow key={item.id} text={item.text} />;
            }
            if (item.kind === "verify") {
              return (
                <GlassIdeTranscriptVerifyCard
                  key={item.id}
                  item={item}
                  onOpenFile={onOpenFile}
                />
              );
            }
            if (item.kind === "tool") {
              return (
                <GlassIdeTranscriptToolCard
                  key={item.id}
                  item={item}
                  onOpenFile={onOpenFile}
                  pendingApproval={state.agentPendingApproval}
                  activeRunId={activeRunId}
                  onPrefillComposer={onPrefillComposer}
                  onSendPrompt={onSendPrompt}
                />
              );
            }
            if (!item.text.trim()) return null;
            const showCaret = agentRunning && item.id === lastTextId;
            return (
              <div
                key={item.id}
                className="gide-transcript__text gide-transcript__text--live glass-selectable-text"
              >
                {parseMarkdown(item.text)}
                {showCaret ? <span className="gide-transcript__caret" aria-hidden="true" /> : null}
              </div>
            );
          })}
          {streamItems.length > 0 && agentRunning && lastTextId === null ? <ThinkingRow /> : null}
          <GlassIdeQaRecovery state={state} activeRunId={activeRunId} />
          <GlassIdeQaActions
            qaPipeline={
              state.qaPipelineState
              && state.qaPipelineState.runId === activeRunId
                ? state.qaPipelineState
                : null
            }
            onOpenFile={onOpenFile}
          />
          <GlassIdeCompletionCard
            card={completionCard}
            onOpenFile={onOpenFile}
            onReviewChanges={handleReviewChanges}
            onRollback={handleRollback}
          />
        </div>
      ) : feed.idle ? (
        <p className="gide-feed-idle">{feed.idleLabel}</p>
      ) : (
        <ul className="gide-feed-list" onWheel={handlePaletteListWheel}>
          {feed.items.map((item) => (
            <li key={item.id} className={`gide-feed-row gide-feed-row--${item.tone}`}>
              <span className="gide-feed-row__icon" aria-hidden="true">{item.icon}</span>
              <div className="gide-feed-row__body">
                <div className="gide-feed-row__label-row">
                  <span className="gide-feed-row__label">{item.label}</span>
                  {item.relativePath && onOpenFile ? (
                    <button
                      type="button"
                      className="gide-feed-row__open"
                      onClick={() => onOpenFile(item.relativePath!)}
                      onPointerDown={ensureOverlayInteractive}
                    >
                      Open
                    </button>
                  ) : null}
                </div>
                {item.detail ? <span className="gide-feed-row__detail">{item.detail}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {feed.showQaFixAll && feed.qaRunId ? (
        <div className="gide-feed-qa-actions">
          <button
            type="button"
            className="gide-feed-qa-fix"
            onClick={() => void window.glass.qaPipelineFixAll({ runId: feed.qaRunId! })}
            onPointerDown={ensureOverlayInteractive}
          >
            Fix all QA issues
          </button>
        </div>
      ) : null}
    </div>
  );
}
