export interface BuilderModeConfirmProps {
  open: boolean;
  onContinue: () => void;
  onKeepInChat: () => void;
}

export default function BuilderModeConfirm({
  open,
  onContinue,
  onKeepInChat,
}: BuilderModeConfirmProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay builder-confirm-overlay" data-testid="builder-mode-confirm">
      <div className="modal builder-confirm-modal" role="dialog" aria-labelledby="builder-confirm-title">
        <h2 id="builder-confirm-title">Open Builder Mode?</h2>
        <p>
          This looks like a larger build. IIVO can create it in a dedicated workspace with
          editing, copy, and export tools.
        </p>
        <div className="builder-confirm-actions">
          <button type="button" className="btn primary" onClick={onContinue}>
            Open Builder
          </button>
          <button type="button" className="btn ghost" onClick={onKeepInChat}>
            Keep in Chat
          </button>
        </div>
      </div>
    </div>
  );
}
