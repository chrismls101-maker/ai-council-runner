import { useEffect, useState } from "react";

export interface ArtifactEditModalProps {
  open: boolean;
  sectionLabel: string;
  initialContent: string;
  loading?: boolean;
  onClose: () => void;
  onSave: (instruction: string, editedContent: string) => void;
}

export default function ArtifactEditModal({
  open,
  sectionLabel,
  initialContent,
  loading = false,
  onClose,
  onSave,
}: ArtifactEditModalProps) {
  const [instruction, setInstruction] = useState("");
  const [content, setContent] = useState(initialContent);

  useEffect(() => {
    if (open) {
      setInstruction("");
      setContent(initialContent);
    }
  }, [open, initialContent]);

  if (!open) return null;

  return (
    <div className="modal-overlay artifact-edit-overlay" data-testid="artifact-edit-modal">
      <div className="modal artifact-edit-modal" role="dialog" aria-labelledby="artifact-edit-title">
        <h2 id="artifact-edit-title">Edit {sectionLabel}</h2>
        <label className="artifact-edit-label">
          What should change?
          <input
            type="text"
            className="artifact-edit-instruction"
            placeholder="e.g. Make it shorter and friendlier"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
        </label>
        <label className="artifact-edit-label">
          Section text
          <textarea
            className="artifact-edit-textarea"
            rows={10}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </label>
        <div className="artifact-edit-actions">
          <button
            type="button"
            className="btn primary"
            disabled={loading}
            onClick={() => onSave(instruction, content)}
          >
            {loading ? "Saving…" : "Apply with AI"}
          </button>
          <button type="button" className="btn ghost" disabled={loading} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
