import type { GlassPathway } from "../../shared/glassPathwaysTypes.ts";
import {
  derivePathwayDisplayStatus,
  formatPathwayUpdatedAt,
  pathwayProgressSummary,
  pathwayStatusLabel,
} from "../../shared/glassPathwaysProgress.ts";
import { prepareGlassTextPointerDown } from "../glassTextInteraction.ts";

interface GlassPathwaysSavedListProps {
  pathways: GlassPathway[];
  activePathwayId: string | null;
  draftMode: boolean;
  variant?: "sidebar" | "drawer";
  onSelect: (pathwayId: string) => void;
  onNewPathway: () => void;
  onRemove: (pathwayId: string) => void;
}

export function GlassPathwaysSavedList({
  pathways,
  activePathwayId,
  draftMode,
  variant = "sidebar",
  onSelect,
  onNewPathway,
  onRemove,
}: GlassPathwaysSavedListProps): JSX.Element {
  return (
    <aside
      className={`gpw-saved gpw-saved--${variant}`}
      data-testid="glass-pathways-saved-list"
    >
      <div className="gpw-saved__head">
        <span className="gpw-saved__title">Saved pathways</span>
        <button
          type="button"
          className="gpw-saved__new"
          onClick={onNewPathway}
          onPointerDown={prepareGlassTextPointerDown}
          data-testid="glass-pathways-new"
        >
          + New
        </button>
      </div>

      {pathways.length === 0 ? (
        <p className="gpw-saved__empty">Your pathways will appear here.</p>
      ) : (
        <ul className="gpw-saved__list">
          {pathways.map((pathway) => {
            const status = derivePathwayDisplayStatus(pathway);
            const isOpen = !draftMode && activePathwayId === pathway.id;
            return (
              <li key={pathway.id} className="gpw-saved__item">
                <button
                  type="button"
                  className={`gpw-saved__card${isOpen ? " gpw-saved__card--open" : ""}`}
                  onClick={() => onSelect(pathway.id)}
                  onPointerDown={prepareGlassTextPointerDown}
                  data-testid={`glass-pathways-saved-${pathway.id}`}
                >
                  <span className="gpw-saved__card-title">{pathway.title}</span>
                  <span className="gpw-saved__card-meta">
                    <span className="gpw-saved__card-domain">{pathway.domain}</span>
                    <span className="gpw-saved__card-dot" aria-hidden="true">
                      ·
                    </span>
                    <span>{pathwayProgressSummary(pathway)}</span>
                  </span>
                  <span className="gpw-saved__card-foot">
                    <span
                      className={`gpw-pathway-badge gpw-pathway-badge--${status}`}
                    >
                      {pathwayStatusLabel(status)}
                    </span>
                    <span className="gpw-saved__card-time">
                      {formatPathwayUpdatedAt(pathway.updatedAt)}
                    </span>
                  </span>
                  {isOpen ? (
                    <span className="gpw-saved__open-pill">Open</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="gpw-saved__remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(pathway.id);
                  }}
                  onPointerDown={prepareGlassTextPointerDown}
                  aria-label={`Remove ${pathway.title}`}
                  title="Remove pathway"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
