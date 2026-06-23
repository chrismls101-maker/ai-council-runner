import { useEffect, useRef, useState } from "react";
import type { QaCheck } from "../../shared/glassQaPipeline.ts";
import {
  qaHasFailures,
  qaOverallStatusLabel,
  qaStatusIcon,
} from "../../shared/glassQaPipeline.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import "./GlassQaBoard.css";

interface GlassQaBoardProps {
  runId: string;
  checks: QaCheck[];
  autoFix?: boolean;
  onFixAll: () => void;
}

export function GlassQaBoard({
  runId,
  checks,
  autoFix = false,
  onFixAll,
}: GlassQaBoardProps): JSX.Element {
  const [autoFixCountdown, setAutoFixCountdown] = useState<number | null>(null);
  const autoFixSuppressedForRunRef = useRef<string | null>(null);
  const hasFailures = qaHasFailures(checks);
  const isComplete = checks.every((c) => (
    c.status === "pass" || c.status === "fail" || c.status === "warn" || c.status === "skipped"
  ));

  useEffect(() => {
    autoFixSuppressedForRunRef.current = null;
    setAutoFixCountdown(null);
  }, [runId]);

  useEffect(() => {
    if (!autoFix || !hasFailures || !isComplete) {
      setAutoFixCountdown(null);
      return;
    }
    if (autoFixSuppressedForRunRef.current === runId) {
      return;
    }

    setAutoFixCountdown(3);
    let remaining = 3;
    const interval = window.setInterval(() => {
      if (autoFixSuppressedForRunRef.current === runId) {
        window.clearInterval(interval);
        setAutoFixCountdown(null);
        return;
      }
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(interval);
        setAutoFixCountdown(null);
        onFixAll();
        return;
      }
      setAutoFixCountdown(remaining);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [autoFix, hasFailures, isComplete, onFixAll, runId]);

  const cancelAutoFix = (): void => {
    autoFixSuppressedForRunRef.current = runId;
    setAutoFixCountdown(null);
  };

  return (
    <div className="gqa-board" data-testid="glass-qa-board">
      <div className="gqa-board__header">
        <span className="gqa-board__icon" aria-hidden="true">◈</span>
        <span className="gqa-board__title">QA Pipeline</span>
        <span className="gqa-board__status">{qaOverallStatusLabel(checks)}</span>
      </div>

      <div className="gqa-board__checks">
        {checks.map((check) => (
          <div
            key={check.id}
            className={`gqa-check gqa-check--${check.status}`}
            data-testid={`glass-qa-check-${check.id}`}
          >
            <span className="gqa-check__indicator" aria-hidden="true">
              {qaStatusIcon(check.status)}
            </span>
            <span className="gqa-check__label">{check.label}</span>
            {check.detail ? (
              <span className="gqa-check__detail">{check.detail}</span>
            ) : null}
          </div>
        ))}
      </div>

      {hasFailures && isComplete ? (
        <div className="gqa-board__actions">
          <button
            type="button"
            className="gqa-board__fix-btn"
            onClick={() => {
              cancelAutoFix();
              onFixAll();
            }}
            onPointerDown={ensureOverlayInteractive}
          >
            {autoFixCountdown != null
              ? `Auto-fixing in ${autoFixCountdown}…`
              : "Fix all with Glass"}
          </button>
          {autoFixCountdown != null ? (
            <button
              type="button"
              className="gqa-board__cancel-btn"
              onClick={cancelAutoFix}
              onPointerDown={ensureOverlayInteractive}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
