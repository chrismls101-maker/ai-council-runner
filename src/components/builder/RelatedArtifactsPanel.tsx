import type { ArtifactRelationship, IivoArtifact } from "../../types/artifacts";
import { transformTypeLabel } from "../../utils/artifactRelationships";

export type RelatedChild = {
  relationship: ArtifactRelationship;
  artifact?: IivoArtifact;
};

export interface RelatedArtifactsPanelProps {
  parentArtifact: IivoArtifact;
  children: RelatedChild[];
  lastTransformLabel?: string;
  onOpenChild: (childId: string) => void;
  onOpenChildInBuilder: (childId: string) => void;
  onKeepOriginal: () => void;
}

export default function RelatedArtifactsPanel({
  parentArtifact,
  children,
  lastTransformLabel,
  onOpenChild,
  onOpenChildInBuilder,
  onKeepOriginal,
}: RelatedArtifactsPanelProps) {
  if (children.length === 0 && !lastTransformLabel) return null;

  return (
    <div className="related-artifacts-panel" data-testid="related-artifacts-panel">
      {lastTransformLabel && (
        <div className="transform-success-banner" data-testid="transform-success-banner">
          <p>
            Created new artifact: <strong>{lastTransformLabel}</strong>
          </p>
          <div className="transform-success-actions">
            {children[0] && (
              <>
                <button
                  type="button"
                  className="btn primary small"
                  data-testid="transform-open-child"
                  onClick={() => onOpenChild(children[0]!.relationship.childArtifactId)}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="btn ghost small"
                  data-testid="transform-open-child-builder"
                  onClick={() =>
                    onOpenChildInBuilder(children[0]!.relationship.childArtifactId)
                  }
                >
                  Open in Builder
                </button>
              </>
            )}
            <button
              type="button"
              className="btn ghost small"
              data-testid="transform-keep-original"
              onClick={onKeepOriginal}
            >
              Keep working on original
            </button>
          </div>
        </div>
      )}

      {children.length > 0 && (
        <>
          <h4>Related artifacts</h4>
          <p className="muted relationship-breadcrumb" data-testid="relationship-breadcrumb">
            Created from: {parentArtifact.title}
            {children.map((c) => (
              <span key={c.relationship.childArtifactId}>
                {" → "}
                {c.artifact?.title ?? transformTypeLabel(c.relationship.transformType)}
              </span>
            ))}
          </p>
          <ul className="related-artifacts-list">
            {children.map((c) => (
              <li key={c.relationship.childArtifactId} data-testid={`related-child-${c.relationship.childArtifactId}`}>
                <span>{c.artifact?.title ?? transformTypeLabel(c.relationship.transformType)}</span>
                <div className="related-artifact-actions">
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => onOpenChild(c.relationship.childArtifactId)}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => onOpenChildInBuilder(c.relationship.childArtifactId)}
                  >
                    Builder
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
