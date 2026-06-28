import type { GlassState } from "../../shared/ipc.ts";
import { dispatchAletheiaCommand } from "../../shared/aletheiaAuthority.ts";
import "./AletheiaComputerLiveAudit.css";

interface AletheiaComputerLiveAuditProps {
  operator: NonNullable<GlassState["aletheiaComputerOperator"]>;
  variant?: "inline" | "slide";
}

export function AletheiaComputerLiveAudit({
  operator,
  variant = "slide",
}: AletheiaComputerLiveAuditProps): JSX.Element | null {
  const running = operator.phase === "running";
  const paused = operator.phase === "paused";
  const complete = operator.phase === "complete";
  const failed = operator.phase === "failed";

  if (!running && !paused && !complete && !failed) return null;

  const handleStop = (): void => {
    dispatchAletheiaCommand("cancel-aletheia-computer-operator");
  };

  const handleDismiss = (): void => {
    dispatchAletheiaCommand("dismiss-aletheia-computer-operator");
  };

  return (
    <section
      className={`aletheia-computer-audit aletheia-computer-audit--${variant}`}
      data-testid="aletheia-computer-live-audit"
      aria-live="polite"
    >
      <div className="aletheia-computer-audit__head">
        <p className="aletheia-computer-audit__label">
          {running ? "Working on your screen" : paused ? "Paused" : complete ? "Done" : "Stopped"}
        </p>
        {operator.step > 0 ? (
          <p className="aletheia-computer-audit__step" data-testid="aletheia-computer-audit-step">
            Step {operator.step}/{operator.plan.stepBudget}
          </p>
        ) : null}
      </div>
      {operator.currentBelief ? (
        <p className="aletheia-computer-audit__belief" data-testid="aletheia-computer-audit-belief">
          {operator.currentBelief}
        </p>
      ) : null}
      {operator.narrative ? (
        <p className="aletheia-computer-audit__narrative" data-testid="aletheia-computer-audit-narrative">
          {operator.narrative}
        </p>
      ) : null}
      {operator.audit.length > 0 ? (
        <ul className="aletheia-computer-audit__trail" data-testid="aletheia-computer-audit-trail">
          {operator.audit.slice(-4).map((row) => (
            <li
              key={row.id}
              className={
                row.ok === true
                  ? "aletheia-computer-audit__trail-row--ok"
                  : row.ok === false
                    ? "aletheia-computer-audit__trail-row--error"
                    : undefined
              }
            >
              {row.narration}
            </li>
          ))}
        </ul>
      ) : null}
      {operator.readSummary ? (
        <p className="aletheia-computer-audit__summary" data-testid="aletheia-computer-audit-read">
          {operator.readSummary}
        </p>
      ) : null}
      {operator.summary ? (
        <p className="aletheia-computer-audit__summary" data-testid="aletheia-computer-audit-summary">
          {operator.summary}
        </p>
      ) : null}
      {operator.pauseReason ? (
        <p className="aletheia-computer-audit__pause" data-testid="aletheia-computer-audit-pause">
          {operator.pauseReason}
        </p>
      ) : null}
      {running || paused ? (
        <button
          type="button"
          className="aletheia-computer-audit__stop"
          data-testid="aletheia-computer-audit-stop"
          onClick={handleStop}
        >
          Stop operator
        </button>
      ) : null}
      {(complete || failed) && variant === "slide" ? (
        <button
          type="button"
          className="aletheia-computer-audit__done"
          data-testid="aletheia-computer-audit-done"
          onClick={handleDismiss}
        >
          Done
        </button>
      ) : null}
    </section>
  );
}
