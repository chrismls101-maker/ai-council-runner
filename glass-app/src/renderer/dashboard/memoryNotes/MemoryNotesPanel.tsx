import { useMemo, useState } from "react";
import type { AletheiaNote } from "../../../shared/aletheiaNotes.ts";
import type { NoteFeatureId } from "../../../shared/memory/aletheiaNotePresentation.ts";
import {
  filterNotesByFeature,
  noteFeatureFilterOptions,
  sortNotesByRecency,
} from "../../../shared/memory/aletheiaNotePresentation.ts";
import { MemoryNoteCard } from "./MemoryNoteCard.tsx";
import { MemoryNoteDetail } from "./MemoryNoteDetail.tsx";
import "./memoryNotes.css";

type MemoryNotesPanelProps = {
  notes: AletheiaNote[];
  featured?: boolean;
  readOnly?: boolean;
  companionActive?: boolean;
  listLimit?: number;
  panelTestId?: string;
  onAdd?: (body: string) => void;
  onUpdate?: (noteId: string, body: string) => void;
  onDelete?: (noteId: string) => void;
};

export function MemoryNotesPanel({
  notes,
  featured = false,
  readOnly = false,
  companionActive = false,
  listLimit,
  panelTestId = "aletheia-dashboard-notes",
  onAdd,
  onUpdate,
  onDelete,
}: MemoryNotesPanelProps): JSX.Element {
  const [draft, setDraft] = useState("");
  const [featureFilter, setFeatureFilter] = useState<NoteFeatureId | "all">("all");
  const [detailNote, setDetailNote] = useState<AletheiaNote | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const filterOptions = useMemo(() => noteFeatureFilterOptions(notes), [notes]);
  const visibleNotes = useMemo(() => {
    const filtered = filterNotesByFeature(notes, featureFilter);
    const sorted = sortNotesByRecency(filtered);
    const limit = listLimit ?? (featured ? 20 : 12);
    return sorted.slice(0, limit);
  }, [notes, featureFilter, featured, listLimit]);

  const canEdit = !readOnly && companionActive && onUpdate && onDelete;
  const canAdd = !readOnly && companionActive && onAdd;

  const handleEdit = (note: AletheiaNote): void => {
    setDetailNote(null);
    setEditingId(note.id);
    setEditDraft(note.body);
  };

  return (
    <section
      className={`memory-notes-panel aletheia-dashboard__panel${featured ? " memory-notes-panel--featured aletheia-dashboard__panel--notes-featured" : ""}`}
      data-testid={panelTestId}
    >
      <p className="memory-notes-panel__label">Notes & memory</p>
      {!featured ? (
        <p className="memory-notes-panel__copy">
          Structured recall from Aletheia — events, saves, and decisions. Open details for full text
          and linked projects.
        </p>
      ) : (
        <p className="memory-notes-panel__copy memory-notes-panel__copy--compact">
          Recent memory — glanceable cards with full detail on demand.
        </p>
      )}

      {filterOptions.length > 1 ? (
        <div className="memory-notes-panel__toolbar">
          <select
            className="memory-notes-panel__filter"
            aria-label="Filter notes by feature"
            value={featureFilter}
            onChange={(event) =>
              setFeatureFilter(event.target.value as NoteFeatureId | "all")
            }
          >
            {filterOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {canAdd ? (
        <div className="memory-notes-panel__add" data-testid="aletheia-dashboard-notes-add">
          <textarea
            className="memory-notes-panel__input"
            rows={featured ? 4 : 2}
            placeholder="Add a note Aletheia should remember…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="button"
            className="memory-notes-panel__secondary-btn"
            data-testid="aletheia-dashboard-notes-add-btn"
            disabled={!draft.trim()}
            onClick={() => {
              const body = draft.trim();
              if (!body || !onAdd) return;
              onAdd(body);
              setDraft("");
            }}
          >
            Add note
          </button>
        </div>
      ) : null}

      {visibleNotes.length === 0 ? (
        <p className="memory-notes-panel__footnote" data-testid="aletheia-dashboard-notes-empty">
          No notes yet — approve advice, confirm actions, or save research to build memory.
        </p>
      ) : (
        <ul className="memory-notes-panel__list" data-testid="aletheia-dashboard-notes-list">
          {visibleNotes.map((note) =>
            editingId === note.id ? (
              <li key={note.id} className="memory-notes-panel__edit-row">
                <textarea
                  className="memory-notes-panel__input"
                  rows={featured ? 4 : 2}
                  value={editDraft}
                  onChange={(event) => setEditDraft(event.target.value)}
                />
                <div className="memory-notes-panel__actions">
                  <button
                    type="button"
                    className="memory-notes-panel__primary-btn"
                    onClick={() => {
                      const body = editDraft.trim();
                      if (!body || !onUpdate) return;
                      onUpdate(note.id, body);
                      setEditingId(null);
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="memory-notes-panel__secondary-btn"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ) : (
              <MemoryNoteCard
                key={note.id}
                note={note}
                onViewDetails={setDetailNote}
                onEdit={canEdit ? handleEdit : undefined}
                onDelete={canEdit ? onDelete : undefined}
              />
            ),
          )}
        </ul>
      )}

      {detailNote ? (
        <MemoryNoteDetail
          note={detailNote}
          onClose={() => setDetailNote(null)}
          onEdit={canEdit ? handleEdit : undefined}
          onDelete={
            canEdit
              ? (noteId) => {
                  onDelete?.(noteId);
                  setDetailNote(null);
                }
              : undefined
          }
        />
      ) : null}
    </section>
  );
}
