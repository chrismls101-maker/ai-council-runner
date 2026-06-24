import type { GlassIdeCompletionCardModel } from "../../shared/glassIdeRunSummary.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";

interface GlassIdeCompletionCardProps {
  card: GlassIdeCompletionCardModel;
  onOpenFile?: (relativePath: string) => void;
  onReviewChanges?: () => void;
  onRollback?: (runId: string) => void;
}

function renderList(title: string, items?: string[]): JSX.Element | null {
  if (!items?.length) return null;
  return (
    <div className="gide-completion-card__section">
      <p className="gide-completion-card__section-title">{title}</p>
      <ul className="gide-completion-card__list">
        {items.map((item) => (
          <li key={`${title}-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function GlassIdeCompletionCard({
  card,
  onOpenFile,
  onReviewChanges,
  onRollback,
}: GlassIdeCompletionCardProps): JSX.Element | null {
  if (!card.visible) return null;

  const hasQaBreakdown = Boolean(
    card.qaPassed?.length
    || card.qaWarnings?.length
    || card.qaSkipped?.length
    || card.qaFailed?.length,
  );

  return (
    <aside
      className={`gide-completion-card gide-completion-card--${card.tone}`}
      data-testid="glass-ide-completion-card"
      aria-label="Run summary"
    >
      <p className="gide-completion-card__headline">{card.headline}</p>
      {card.shipLabel ? (
        <p className="gide-completion-card__ship">Ship state: {card.shipLabel}</p>
      ) : null}
      {card.shipSubline ? (
        <p className="gide-completion-card__ship-subline">{card.shipSubline}</p>
      ) : null}
      {card.detail ? (
        <p className="gide-completion-card__detail">{card.detail}</p>
      ) : null}
      {hasQaBreakdown ? (
        <div className="gide-completion-card__qa">
          {renderList("Passed", card.qaPassed)}
          {renderList("Warnings", card.qaWarnings)}
          {renderList("Skipped", card.qaSkipped)}
          {renderList("Failed", card.qaFailed)}
        </div>
      ) : null}
      {(card.showReviewChangesCta || card.canRollback) ? (
        <div className="gide-completion-card__actions">
          {card.showReviewChangesCta ? (
            <button
              type="button"
              className="gide-completion-card__cta"
              data-testid="glass-ide-review-all-changes"
              onClick={() => {
                if (onReviewChanges) {
                  onReviewChanges();
                } else if (card.reviewChangesPath && onOpenFile) {
                  onOpenFile(card.reviewChangesPath);
                }
              }}
              onPointerDown={ensureOverlayInteractive}
            >
              Review all changes
            </button>
          ) : null}
          {card.canRollback && card.rollbackRunId && onRollback ? (
            <button
              type="button"
              className="gide-completion-card__cta gide-completion-card__cta--secondary"
              data-testid="glass-ide-completion-rollback"
              onClick={() => onRollback(card.rollbackRunId!)}
              onPointerDown={ensureOverlayInteractive}
            >
              Rollback to checkpoint
            </button>
          ) : null}
        </div>
      ) : null}
      {card.nextStep ? (
        <p className="gide-completion-card__next">{card.nextStep}</p>
      ) : null}
    </aside>
  );
}
