import { useCallback, useEffect, useRef, useState } from "react";
import type { QaPipelineState } from "../../shared/glassQaPipeline.ts";
import { qaHasFailures } from "../../shared/glassQaPipeline.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";

interface GlassIdeQaActionsProps {
  qaPipeline: QaPipelineState | null;
  onOpenFile?: (relativePath: string) => void;
}

export function GlassIdeQaActions({
  qaPipeline,
}: GlassIdeQaActionsProps): JSX.Element | null {
  const [autoFixCountdown, setAutoFixCountdown] = useState<number | null>(null);
  const suppressedRunRef = useRef<string | null>(null);

  const runId = qaPipeline?.runId ?? null;
  const checks = qaPipeline?.checks ?? [];
  const autoFix = qaPipeline?.autoFix === true;
  const isComplete = qaPipeline?.status === "done";
  const hasFailures = qaHasFailures(checks);

  useEffect(() => {
    suppressedRunRef.current = null;
    setAutoFixCountdown(null);
  }, [runId]);

  const cancelAutoFix = useCallback((): void => {
    suppressedRunRef.current = runId;
    setAutoFixCountdown(null);
  }, [runId]);

  const triggerFix = useCallback((): void => {
    if (!runId) return;
    cancelAutoFix();
    void window.glass.qaPipelineFixAll({ runId });
  }, [cancelAutoFix, runId]);

  useEffect(() => {
    if (!autoFix || !hasFailures || !isComplete || !runId) {
      setAutoFixCountdown(null);
      return;
    }
    if (suppressedRunRef.current === runId) return;

    setAutoFixCountdown(3);
    let remaining = 3;
    const interval = window.setInterval(() => {
      if (suppressedRunRef.current === runId) {
        window.clearInterval(interval);
        setAutoFixCountdown(null);
        return;
      }
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(interval);
        setAutoFixCountdown(null);
        triggerFix();
        return;
      }
      setAutoFixCountdown(remaining);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [autoFix, hasFailures, isComplete, runId, triggerFix]);

  if (!qaPipeline || !isComplete || !hasFailures) return null;

  return (
    <div className="gide-qa-actions" data-testid="glass-ide-qa-actions">
      <button
        type="button"
        className="gide-qa-actions__fix"
        onClick={triggerFix}
        onPointerDown={ensureOverlayInteractive}
      >
        {autoFixCountdown != null
          ? `Auto-fixing in ${autoFixCountdown}…`
          : "Fix all with Glass"}
      </button>
      {autoFixCountdown != null ? (
        <button
          type="button"
          className="gide-qa-actions__cancel"
          onClick={cancelAutoFix}
          onPointerDown={ensureOverlayInteractive}
        >
          Cancel
        </button>
      ) : null}
      <button
        type="button"
        className="gide-qa-actions__secondary"
        onClick={() => window.glass.qaAutoFixToggle()}
        onPointerDown={ensureOverlayInteractive}
      >
        Auto-fix: {autoFix ? "On" : "Off"}
      </button>
      <p className="gide-qa-actions__note">
        QA recovery may auto-edit already touched files. New files still require approval.
      </p>
    </div>
  );
}
