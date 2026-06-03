export interface CouncilModeConfirmProps {
  open: boolean;
  onKeepQuick: () => void;
  onUseCouncil: () => void;
}

export default function CouncilModeConfirm({
  open,
  onKeepQuick,
  onUseCouncil,
}: CouncilModeConfirmProps) {
  if (!open) return null;

  return (
    <div className="council-confirm-overlay" data-testid="council-mode-confirm">
      <div
        className="council-confirm-modal iivo-glass-modal"
        role="dialog"
        aria-labelledby="council-confirm-title"
      >
        <h2 id="council-confirm-title">Use Council Mode?</h2>
        <p>
          This may take longer because IIVO will use multiple agents to think through the answer.
        </p>
        <div className="council-confirm-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={onKeepQuick}
            data-testid="council-confirm-keep-quick"
          >
            Keep Quick
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={onUseCouncil}
            data-testid="council-confirm-use-council"
          >
            Use Council
          </button>
        </div>
      </div>
    </div>
  );
}
