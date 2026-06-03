import { useEffect, useState } from "react";
import { withIivoWordmark } from "../utils/brandText";
import type { ContextItemType } from "../types/contextBridge";

export interface PasteContextFormValues {
  title: string;
  sourceUrl: string;
  contentText: string;
  tags: string;
  project: string;
  type: ContextItemType;
}

interface PasteContextModalProps {
  open: boolean;
  initialType?: ContextItemType;
  initialValues?: Partial<PasteContextFormValues>;
  onClose: () => void;
  onAddToPrompt: (values: PasteContextFormValues) => void;
  onSaveEvidence: (values: PasteContextFormValues) => Promise<void>;
  onSaveAndAsk: (values: PasteContextFormValues) => Promise<void>;
}

const EMPTY: PasteContextFormValues = {
  title: "",
  sourceUrl: "",
  contentText: "",
  tags: "",
  project: "",
  type: "pasted_text",
};

export default function PasteContextModal({
  open,
  initialType = "pasted_text",
  initialValues,
  onClose,
  onAddToPrompt,
  onSaveEvidence,
  onSaveAndAsk,
}: PasteContextModalProps) {
  const [form, setForm] = useState<PasteContextFormValues>({ ...EMPTY, type: initialType });
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, type: initialType, ...initialValues });
    }
  }, [open, initialType, initialValues]);

  if (!open) return null;

  const update = (field: keyof PasteContextFormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const valid = form.title.trim() && form.contentText.trim();

  const run = async (action: "add" | "save" | "ask") => {
    if (!valid) return;
    if (action === "add") {
      onAddToPrompt(form);
      onClose();
      return;
    }
    setBusy(action);
    try {
      if (action === "save") await onSaveEvidence(form);
      else await onSaveAndAsk(form);
      onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="memory-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="memory-modal context-bridge-modal"
        role="dialog"
        aria-labelledby="paste-context-title"
        data-testid="paste-context-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="memory-modal-header">
          <h2 id="paste-context-title">Paste Context</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="memory-modal-body">
          <label className="memory-field">
            <span>Title</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="What is this context?"
              data-testid="paste-context-title-input"
            />
          </label>
          <label className="memory-field">
            <span>Source URL (optional)</span>
            <input
              type="url"
              value={form.sourceUrl}
              onChange={(e) => update("sourceUrl", e.target.value)}
              placeholder="https://…"
              data-testid="paste-context-url-input"
            />
          </label>
          <label className="memory-field">
            <span>Context</span>
            <textarea
              value={form.contentText}
              onChange={(e) => update("contentText", e.target.value)}
              rows={8}
              placeholder="Paste notes, AI answers, research, or decision background…"
              data-testid="paste-context-text-input"
            />
          </label>
          <label className="memory-field">
            <span>Tags (optional)</span>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => update("tags", e.target.value)}
              placeholder="comma-separated"
            />
          </label>
          <label className="memory-field">
            <span>Project (optional)</span>
            <input
              type="text"
              value={form.project}
              onChange={(e) => update("project", e.target.value)}
            />
          </label>
        </div>
        <div className="memory-modal-footer context-bridge-modal-footer">
          <button type="button" className="btn ghost small" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn ghost small"
            disabled={!valid || busy !== null}
            data-testid="paste-context-add-btn"
            onClick={() => void run("add")}
          >
            Add to current prompt
          </button>
          <button
            type="button"
            className="btn ghost small"
            disabled={!valid || busy !== null}
            data-testid="paste-context-save-btn"
            onClick={() => void run("save")}
          >
            {busy === "save" ? "Saving…" : "Save as Evidence"}
          </button>
          <button
            type="button"
            className="btn primary small"
            disabled={!valid || busy !== null}
            data-testid="paste-context-ask-btn"
            onClick={() => void run("ask")}
          >
            {busy === "ask" ? "Saving…" : withIivoWordmark("Save and Ask IIVO", "paste-ask")}
          </button>
        </div>
      </div>
    </div>
  );
}
