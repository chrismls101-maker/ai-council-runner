import type { ConversationArtifactEvent } from "../types";
import type { ArtifactSection, IivoArtifact } from "../types/artifacts";
import { snapshotToInlineArtifact } from "../utils/artifactSnapshot";

export interface ChildArtifactEventCardProps {
  event: ConversationArtifactEvent;
  parentTitle?: string;
  onOpen?: (artifact: IivoArtifact) => void;
  onOpenInBuilder?: (artifact: IivoArtifact) => void;
  onCopy?: (text: string) => void;
}

export default function ChildArtifactEventCard({
  event,
  parentTitle,
  onOpen,
  onOpenInBuilder,
  onCopy,
}: ChildArtifactEventCardProps) {
  const artifact = snapshotToInlineArtifact(event.artifactSnapshot);
  const relationshipLabel = parentTitle
    ? `Created from: ${parentTitle} → ${event.title}`
    : `Created: ${event.title}`;

  return (
    <div
      className="child-artifact-event-card"
      data-testid="child-artifact-event"
      data-child-artifact-id={event.childArtifactId}
    >
      <p className="child-artifact-event-label muted" data-testid="child-artifact-relationship">
        {relationshipLabel}
      </p>
      <div className="child-artifact-event-body">
        <strong>{event.title}</strong>
        <span className="muted"> · {event.transformType.replace(/_/g, " ")}</span>
      </div>
      <div className="child-artifact-event-actions">
        {artifact && onOpen && (
          <button
            type="button"
            className="btn ghost small"
            data-testid="child-artifact-open"
            onClick={() => onOpen(artifact)}
          >
            Open
          </button>
        )}
        {artifact && onOpenInBuilder && (
          <button
            type="button"
            className="btn ghost small"
            data-testid="child-artifact-open-builder"
            onClick={() => onOpenInBuilder(artifact)}
          >
            Open in Builder
          </button>
        )}
        {artifact && onCopy && (
          <button
            type="button"
            className="btn ghost small"
            data-testid="child-artifact-copy"
            onClick={() =>
              onCopy(
                artifact.sections
                  .map((s: ArtifactSection) =>
                    typeof s.content === "string" ? s.content : JSON.stringify(s.content),
                  )
                  .join("\n\n"),
              )
            }
          >
            Copy
          </button>
        )}
        <button
          type="button"
          className="btn ghost small"
          data-testid="child-artifact-show-relationship"
          title={relationshipLabel}
        >
          Show relationship
        </button>
      </div>
    </div>
  );
}
