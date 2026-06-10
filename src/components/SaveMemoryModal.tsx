import { useEffect, useState } from "react";
import {
  EMPTY_SAVE_DRAFT,
  MEMORY_TYPE_LABELS,
  type SaveMemoryDraft,
  type MemoryType,
} from "../types/memory";

interface SaveMemoryModalProps {
  initialDraft?: Partial<SaveMemoryDraft>;
  editing?: boolean;
  onClose: () => void;
  onSave: (draft: SaveMemoryDraft) => Promise<void>;
}

export default function SaveMemoryModal({
  initialDraft,
  editing = false,
  onClose,
  onSave,
}: SaveMemoryModalProps) {
  const [draft, setDraft] = useState<SaveMemoryDraft>({
    ...EMPTY_SAVE_DRAFT,
    ...initialDraft,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({ ...EMPTY_SAVE_DRAFT, ...initialDraft });
  }, [initialDraft]);

  const update = (field: keyof SaveMemoryDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const isDecision = draft.type === "decision";
  const isEvidence = draft.type === "evidence";

  return (
    <div className="memory-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="memory-modal"
        role="dialog"
        aria-labelledby="save-memory-title"
        onClick={(e) => e.stopPropagation()}
        data-testid="save-memory-modal"
      >
        <div className="memory-modal-header">
          <h2 id="save-memory-title">{editing ? "Edit Memory" : "Save to Memory"}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="memory-modal-body">
          <label className="memory-field">
            <span>Memory Type</span>
            <select
              value={draft.type}
              onChange={(e) => update("type", e.target.value)}
              disabled={editing}
              data-testid="memory-type-select"
            >
              {(Object.keys(MEMORY_TYPE_LABELS) as MemoryType[]).map((type) => (
                <option key={type} value={type}>
                  {MEMORY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

          <label className="memory-field">
            <span>Project Name</span>
            <input
              type="text"
              value={draft.projectName}
              onChange={(e) => update("projectName", e.target.value)}
              placeholder="e.g. Your product or client name"
            />
          </label>

          {isDecision ? (
            <>
              <label className="memory-field">
                <span>Decision</span>
                <input
                  type="text"
                  value={draft.decision}
                  onChange={(e) => update("decision", e.target.value)}
                />
              </label>
              <label className="memory-field">
                <span>Reason</span>
                <textarea
                  value={draft.reason}
                  onChange={(e) => update("reason", e.target.value)}
                  rows={4}
                />
              </label>
            </>
          ) : (
            <>
              <label className="memory-field">
                <span>Title</span>
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => update("title", e.target.value)}
                  data-testid="memory-title-input"
                />
              </label>
              <label className="memory-field">
                <span>Content</span>
                <textarea
                  value={draft.content}
                  onChange={(e) => update("content", e.target.value)}
                  rows={5}
                  data-testid="memory-content-input"
                />
              </label>
            </>
          )}

          {draft.type === "project_fact" && (
            <label className="memory-field">
              <span>Tags</span>
              <input
                type="text"
                value={draft.tags}
                onChange={(e) => update("tags", e.target.value)}
                placeholder="comma-separated"
              />
            </label>
          )}

          {isEvidence && (
            <label className="memory-field">
              <span>Source URL</span>
              <input
                type="url"
                value={draft.sourceUrl}
                onChange={(e) => update("sourceUrl", e.target.value)}
              />
            </label>
          )}

          {draft.relatedRunId && (
            <label className="memory-field">
              <span>Related Run ID</span>
              <input type="text" value={draft.relatedRunId} readOnly />
            </label>
          )}
        </div>

        <div className="memory-modal-footer">
          <button type="button" className="btn" onClick={onClose} data-testid="memory-modal-cancel">
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={handleSubmit}
            disabled={saving}
            data-testid="memory-modal-save"
          >
            {saving ? "Saving…" : editing ? "Update memory" : "Save to Memory"}
          </button>
        </div>
      </div>
    </div>
  );
}
