import type { CreditEstimateResponse } from "../types/usage";
import { formatCredits } from "../utils/usageApi";

interface CreditConfirmModalProps {
  open: boolean;
  estimate: CreditEstimateResponse | null;
  currentCredits: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CreditConfirmModal({
  open,
  estimate,
  currentCredits,
  onConfirm,
  onCancel,
}: CreditConfirmModalProps) {
  if (!open || !estimate) return null;

  const remaining = currentCredits - estimate.estimatedCredits;

  return (
    <div className="credit-confirm-overlay" role="presentation" onClick={onCancel}>
      <div
        className="credit-confirm-modal iivo-glass-modal"
        role="dialog"
        aria-labelledby="credit-confirm-title"
        data-testid="credit-confirm-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="credit-confirm-title">Confirm credit use</h3>
        <p>
          This run will use <strong>{formatCredits(estimate.estimatedCredits)}</strong>.
          You have <strong>{formatCredits(currentCredits)}</strong> remaining.
        </p>
        {remaining < 20 && (
          <p className="credit-confirm-warning muted">
            After this run you&apos;ll have {formatCredits(Math.max(0, remaining))} left.
          </p>
        )}
        <ul className="credit-confirm-breakdown">
          {estimate.breakdown.map((line) => (
            <li key={line.label}>
              <span>{line.label}</span>
              <span>{formatCredits(line.credits)}</span>
            </li>
          ))}
        </ul>
        <div className="credit-confirm-actions">
          <button
            type="button"
            className="btn ghost small"
            onClick={onCancel}
            data-testid="credit-confirm-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn primary small"
            onClick={onConfirm}
            data-testid="credit-confirm-continue"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
