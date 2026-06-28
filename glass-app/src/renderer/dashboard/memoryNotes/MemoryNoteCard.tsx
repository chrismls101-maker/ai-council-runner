import type { AletheiaNote } from "../../../shared/aletheiaNotes.ts";
import {
  featureDisplayLabel,
  formatLinkedProjectId,
  formatNoteTimestamp,
  inferNoteFeature,
  inferNoteStatus,
  noteSourceLine,
  noteSummary,
  noteTitle,
  statusDisplayLabel,
} from "../../../shared/memory/aletheiaNotePresentation.ts";

type MemoryNoteCardProps = {
  note: AletheiaNote;
  onViewDetails: (note: AletheiaNote) => void;
  onEdit?: (note: AletheiaNote) => void;
  onDelete?: (noteId: string) => void;
  testIdPrefix?: string;
};

export function MemoryNoteCard({
  note,
  onViewDetails,
  onEdit,
  onDelete,
  testIdPrefix = "memory-note",
}: MemoryNoteCardProps): JSX.Element {
  const feature = inferNoteFeature(note);
  const status = inferNoteStatus(note);

  return (
    <li
      className="memory-note-card"
      data-testid={`${testIdPrefix}-${note.id}`}
    >
      <div className="memory-note-card__head">
        <h4 className="memory-note-card__title">{noteTitle(note)}</h4>
        <time className="memory-note-card__time" dateTime={new Date(note.updatedAt).toISOString()}>
          {formatNoteTimestamp(note.updatedAt)}
        </time>
      </div>
      <div className="memory-note-card__badges">
        <span className="memory-note-card__feature">{featureDisplayLabel(feature)}</span>
        {status ? (
          <span className={`memory-note-card__status memory-note-card__status--${status}`}>
            {statusDisplayLabel(status)}
          </span>
        ) : null}
      </div>
      <p className="memory-note-card__summary">{noteSummary(note)}</p>
      <div className="memory-note-card__meta-row">
        <span>{noteSourceLine(note)}</span>
        {note.linkedProjectId ? (
          <span className="memory-note-card__project" title={note.linkedProjectId}>
            Project {formatLinkedProjectId(note.linkedProjectId)}
          </span>
        ) : null}
      </div>
      <div className="memory-note-card__actions">
        <button
          type="button"
          className="memory-note-card__btn"
          data-testid={`${testIdPrefix}-details-${note.id}`}
          onClick={() => onViewDetails(note)}
        >
          View details
        </button>
        {onEdit ? (
          <button
            type="button"
            className="memory-note-card__btn"
            data-testid={`aletheia-dashboard-note-edit-${note.id}`}
            onClick={() => onEdit(note)}
          >
            Edit
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            className="memory-note-card__btn"
            data-testid={`aletheia-dashboard-note-delete-${note.id}`}
            onClick={() => onDelete(note.id)}
          >
            Delete
          </button>
        ) : null}
      </div>
    </li>
  );
}
