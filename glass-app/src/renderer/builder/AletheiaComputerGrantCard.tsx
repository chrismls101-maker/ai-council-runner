import { useCallback, useEffect, useState } from "react";
import type { GlassState } from "../../shared/ipc.ts";
import { dispatchAletheiaCommand } from "../../shared/aletheiaAuthority.ts";
import { primaryTargetApp } from "../../shared/aletheiaComputerSessionAuthority.ts";
import { COMPUTER_OPERATOR_PLACEHOLDER_GOAL } from "../../shared/aletheiaComputerOperatorLoop.ts";
import "./AletheiaComputerGrantCard.css";

interface AletheiaComputerGrantCardProps {
  operator: NonNullable<GlassState["aletheiaComputerOperator"]>;
  variant?: "inline" | "slide";
  lastPrompt?: string;
  onDismiss?: () => void;
}

function isPlaceholderGoal(goal: string): boolean {
  return goal.startsWith("Enter a task") || goal === COMPUTER_OPERATOR_PLACEHOLDER_GOAL;
}

export function AletheiaComputerGrantCard({
  operator,
  variant = "slide",
  lastPrompt,
  onDismiss,
}: AletheiaComputerGrantCardProps): JSX.Element {
  const showGoalField = variant === "slide" || isPlaceholderGoal(operator.plan.goal);
  const [goal, setGoal] = useState(
    isPlaceholderGoal(operator.plan.goal) ? "" : operator.plan.goal,
  );

  useEffect(() => {
    if (lastPrompt?.trim() && !goal.trim()) {
      setGoal(lastPrompt.trim());
    }
  }, [lastPrompt, goal]);

  const targetApp = primaryTargetApp(operator.plan);
  const awaiting =
    operator.phase === "awaiting_grant" || operator.phase === "awaiting_confirm";

  const handleGrant = useCallback((): void => {
    const resolvedGoal = (showGoalField ? goal.trim() : operator.plan.goal) || goal.trim();
    if (!resolvedGoal.trim()) return;
    dispatchAletheiaCommand("grant-aletheia-computer-session", {
      loopId: operator.loopId,
      goal: resolvedGoal,
    });
  }, [goal, operator.loopId, operator.plan.goal, showGoalField]);

  const handleAlwaysAllow = useCallback((): void => {
    const resolvedGoal = (showGoalField ? goal.trim() : operator.plan.goal) || goal.trim();
    if (!resolvedGoal.trim()) return;
    dispatchAletheiaCommand("grant-aletheia-computer-session", {
      loopId: operator.loopId,
      goal: resolvedGoal,
      alwaysAllow: true,
    });
  }, [goal, operator.loopId, operator.plan.goal, showGoalField]);

  const handleCancel = useCallback((): void => {
    dispatchAletheiaCommand("cancel-aletheia-computer-operator");
    onDismiss?.();
  }, [onDismiss]);

  if (!awaiting) return <></>;

  const grantDisabled = showGoalField ? !goal.trim() : isPlaceholderGoal(operator.plan.goal);

  return (
    <section
      className={`aletheia-computer-grant-card aletheia-computer-grant-card--${variant}`}
      data-testid="aletheia-computer-grant-card"
      aria-label="Computer operator session grant"
    >
      {variant === "slide" ? (
        <p className="aletheia-computer-grant-card__label">Computer operator</p>
      ) : null}
      {showGoalField ? (
        <>
          <label className="aletheia-computer-grant-card__field-label" htmlFor="aletheia-computer-grant-goal">
            Goal
          </label>
          <textarea
            id="aletheia-computer-grant-goal"
            className="aletheia-computer-grant-card__goal"
            data-testid="aletheia-computer-grant-goal"
            rows={variant === "inline" ? 2 : 2}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Open Slack, go to the unread thread, and summarize it…"
          />
        </>
      ) : null}
      {operator.sessionGrant ? (
        <p className="aletheia-computer-grant-card__scope" data-testid="aletheia-computer-grant-scope">
          {operator.sessionGrant.declaration}
        </p>
      ) : null}
      <ul className="aletheia-computer-grant-card__meta" data-testid="aletheia-computer-grant-meta">
        <li>Target: {targetApp}</li>
        <li>Max steps: {operator.plan.stepBudget}</li>
        <li>Forbidden: send, delete, close, destructive actions</li>
      </ul>
      {operator.phase === "awaiting_confirm" ? (
        <p className="aletheia-computer-grant-card__note">
          This task may include sensitive actions — review scope before granting.
        </p>
      ) : null}
      <div className="aletheia-computer-grant-card__actions">
        <button
          type="button"
          className="aletheia-computer-grant-card__btn aletheia-computer-grant-card__btn--primary"
          data-testid="aletheia-computer-grant-run"
          disabled={grantDisabled}
          onClick={handleGrant}
        >
          Grant this session
        </button>
        <button
          type="button"
          className="aletheia-computer-grant-card__btn"
          data-testid="aletheia-computer-grant-always"
          disabled={grantDisabled || operator.plan.targetApps.length === 0}
          onClick={handleAlwaysAllow}
        >
          Always allow for {targetApp}
        </button>
        <button
          type="button"
          className="aletheia-computer-grant-card__btn aletheia-computer-grant-card__btn--ghost"
          data-testid="aletheia-computer-grant-cancel"
          onClick={handleCancel}
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
