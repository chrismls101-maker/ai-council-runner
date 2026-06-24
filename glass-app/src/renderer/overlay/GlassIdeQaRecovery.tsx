import { useState } from "react";
import { deriveQaRecoveryUi } from "../../shared/glassQaRecovery.ts";
import type { GlassState } from "../../shared/ipc.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";

interface GlassIdeQaRecoveryProps {
  state: GlassState;
  activeRunId: string | null;
}

export function GlassIdeQaRecovery({
  state,
  activeRunId,
}: GlassIdeQaRecoveryProps): JSX.Element | null {
  const [showPrompt, setShowPrompt] = useState(false);
  const recovery = state.qaRecoveryState;
  const sessionId = state.coderLoopSessionId ?? activeRunId;
  const model = deriveQaRecoveryUi({
    recovery: recovery?.sessionId === sessionId ? recovery : null,
    loopIteration: state.coderLoopIteration,
    hasCheckpoint: Boolean(
      state.coderCheckpoints?.some((cp) => cp.runId === sessionId && cp.files.length > 0),
    ),
  });

  if (!model.visible) return null;

  const handleRollback = (): void => {
    if (!model.sessionId) return;
    void window.glass.coderRollbackCheckpoint({ runId: model.sessionId });
  };

  return (
    <section className="gide-qa-recovery" data-testid="glass-ide-qa-recovery">
      <header className="gide-qa-recovery__head">
        <span className="gide-qa-recovery__title">Recovery</span>
        <span className="gide-qa-recovery__meta">
          QA fix loop {model.iteration}/{model.maxIterations}
          {model.lastFailedLabel ? ` · last fail: ${model.lastFailedLabel}` : ""}
        </span>
      </header>

      {model.needsHumanJudgment ? (
        <p className="gide-qa-recovery__judgment">
          Needs human judgment
          {model.judgmentReason ? ` — ${model.judgmentReason}` : ""}
        </p>
      ) : null}

      {model.recoveryPlan.length > 0 ? (
        <div className="gide-qa-recovery__plan">
          <p className="gide-qa-recovery__section-title">Prioritized fixes</p>
          <ol className="gide-qa-recovery__plan-list">
            {model.recoveryPlan.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {model.pendingRerunLabel ? (
        <p className="gide-qa-recovery__rerun">{model.pendingRerunLabel}</p>
      ) : null}

      {model.fixPromptPreview ? (
        <div className="gide-qa-recovery__prompt">
          <button
            type="button"
            className="gide-qa-recovery__prompt-toggle"
            onClick={() => setShowPrompt((v) => !v)}
            onPointerDown={ensureOverlayInteractive}
          >
            {showPrompt ? "Hide fix prompt" : "View fix prompt"}
          </button>
          {showPrompt ? (
            <pre className="gide-qa-recovery__prompt-body">{model.fixPromptPreview}</pre>
          ) : null}
        </div>
      ) : null}

      {model.loopHistory.length > 0 ? (
        <div className="gide-qa-recovery__history">
          <p className="gide-qa-recovery__section-title">Loop history</p>
          <ul className="gide-qa-recovery__history-list">
            {model.loopHistory.map((entry) => (
              <li key={entry.iteration}>
                {entry.iteration}/{model.maxIterations}{" "}
                {entry.status === "running"
                  ? "running"
                  : entry.status === "passed"
                    ? "passed"
                    : `failed: ${entry.failedLabels.join(", ")}`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {model.canRollback ? (
        <button
          type="button"
          className="gide-qa-recovery__rollback"
          onClick={handleRollback}
          onPointerDown={ensureOverlayInteractive}
        >
          Rollback to checkpoint
        </button>
      ) : null}
    </section>
  );
}
