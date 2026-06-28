import { useEffect } from "react";
import type { AletheiaNote } from "../../../shared/aletheiaNotes.ts";
import {
  featureDisplayLabel,
  formatNoteTimestamp,
  inferNoteFeature,
  inferNoteStatus,
  noteCategorySourceLabels,
  noteSourceLine,
  noteTitle,
  statusDisplayLabel,
} from "../../../shared/memory/aletheiaNotePresentation.ts";

type MemoryNoteDetailProps = {
  note: AletheiaNote;
  onClose: () => void;
  onEdit?: (note: AletheiaNote) => void;
  onDelete?: (noteId: string) => void;
};

export function MemoryNoteDetail({
  note,
  onClose,
  onEdit,
  onDelete,
}: MemoryNoteDetailProps): JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const feature = inferNoteFeature(note);
  const status = inferNoteStatus(note);
  const meta = noteCategorySourceLabels(note);

  return (
    <div
      className="memory-note-detail__backdrop"
      data-testid="memory-note-detail-backdrop"
      onClick={onClose}
    >
      <article
        className="memory-note-detail"
        data-testid="memory-note-detail"
        onClick={(event) => event.stopPropagation()}
        aria-labelledby="memory-note-detail-title"
      >
        <header className="memory-note-detail__header">
          <h3 id="memory-note-detail-title" className="memory-note-detail__title">
            {noteTitle(note)}
          </h3>
          <p className="memory-note-card__badges">
            <span className="memory-note-card__feature">{featureDisplayLabel(feature)}</span>
            {status ? (
              <span className={`memory-note-card__status memory-note-card__status--${status}`}>
                {statusDisplayLabel(status)}
              </span>
            ) : null}
          </p>
        </header>
        <div className="memory-note-detail__scroll">
          <p className="memory-note-detail__section-label">Metadata</p>
          <div className="memory-note-detail__meta-grid">
            <div className="memory-note-detail__meta-row">
              <span className="memory-note-detail__meta-key">When</span>
              <span className="memory-note-detail__meta-value">
                {formatNoteTimestamp(note.updatedAt)}
              </span>
            </div>
            <div className="memory-note-detail__meta-row">
              <span className="memory-note-detail__meta-key">Source</span>
              <span className="memory-note-detail__meta-value">{noteSourceLine(note)}</span>
            </div>
            <div className="memory-note-detail__meta-row">
              <span className="memory-note-detail__meta-key">Category</span>
              <span className="memory-note-detail__meta-value">{meta.categoryLabel}</span>
            </div>
            {note.linkedProjectId ? (
              <div className="memory-note-detail__meta-row">
                <span className="memory-note-detail__meta-key">Project</span>
                <span className="memory-note-detail__meta-value memory-note-detail__meta-value--mono">
                  {note.linkedProjectId}
                </span>
              </div>
            ) : null}
            {note.sessionId ? (
              <div className="memory-note-detail__meta-row">
                <span className="memory-note-detail__meta-key">Session</span>
                <span className="memory-note-detail__meta-value memory-note-detail__meta-value--mono">
                  {note.sessionId}
                </span>
              </div>
            ) : null}
            <div className="memory-note-detail__meta-row">
              <span className="memory-note-detail__meta-key">Note id</span>
              <span className="memory-note-detail__meta-value memory-note-detail__meta-value--mono">
                {note.id}
              </span>
            </div>
          </div>
          <p className="memory-note-detail__section-label">Full note</p>
          <p className="memory-note-detail__body">{note.body}</p>
          {note.rationale ? (
            <>
              <p className="memory-note-detail__section-label">Rationale / diagnostic</p>
              <p className="memory-note-detail__rationale">{note.rationale}</p>
            </>
          ) : null}
        </div>
        <footer className="memory-note-detail__footer">
          <button type="button" className="memory-note-card__btn" onClick={onClose}>
            Close
          </button>
          {onEdit ? (
            <button
              type="button"
              className="memory-note-card__btn"
              onClick={() => onEdit(note)}
            >
              Edit
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="memory-note-card__btn"
              onClick={() => onDelete(note.id)}
            >
              Delete
            </button>
          ) : null}
        </footer>
      </article>
    </div>
  );
}
