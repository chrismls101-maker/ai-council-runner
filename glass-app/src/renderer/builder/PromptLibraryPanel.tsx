import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Prompt,
  createPrompt,
  deletePrompt,
  loadPrompts,
  savePrompts,
  searchPrompts,
  updatePrompt,
} from "./promptStorage.ts";
import { PowerPromptPanel } from "./PowerPromptPanel.tsx";
import "./PromptLibraryPanel.css";

interface PromptLibraryPanelProps {
  onClose: () => void;
}

type PromptLibrarySection = "library" | "generator";

type EditingState =
  | { mode: "none" }
  | { mode: "new" }
  | { mode: "edit"; promptId: string };

export function PromptLibraryPanel({ onClose }: PromptLibraryPanelProps): JSX.Element {
  const [section, setSection] = useState<PromptLibrarySection>("library");
  const [prompts, setPrompts] = useState<Prompt[]>(() => loadPrompts());
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EditingState>({ mode: "none" });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Persist on every change
  useEffect(() => {
    savePrompts(prompts);
  }, [prompts]);

  // Focus search on open
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const filtered = searchPrompts(prompts, query);

  const handleCopy = useCallback(
    async (prompt: Prompt): Promise<void> => {
      try {
        await navigator.clipboard.writeText(prompt.body);
      } catch {
        // fallback
        const el = document.createElement("textarea");
        el.value = prompt.body;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopiedId(prompt.id);
      setShowToast(true);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setShowToast(false);
        setCopiedId(null);
      }, 1800);
    },
    [],
  );

  const handleDelete = useCallback((id: string): void => {
    setPrompts((prev) => deletePrompt(prev, id));
  }, []);

  const handleEdit = useCallback((id: string): void => {
    setEditing({ mode: "edit", promptId: id });
  }, []);

  const handleNew = useCallback((): void => {
    setEditing({ mode: "new" });
  }, []);

  const handleSave = useCallback(
    (title: string, body: string): void => {
      if (editing.mode === "none") return;
      if (editing.mode === "new") {
        const p = createPrompt(title, body);
        setPrompts((prev) => [p, ...prev]);
      } else {
        setPrompts((prev) => updatePrompt(prev, editing.promptId, { title, body }));
      }
      setEditing({ mode: "none" });
    },
    [editing],
  );

  const handleCancelEdit = useCallback((): void => {
    setEditing({ mode: "none" });
  }, []);

  const editingPrompt =
    editing.mode === "edit"
      ? prompts.find((p) => p.id === editing.promptId) ?? null
      : null;

  return (
    <div className="prompt-library" style={{ position: "relative" }}>
      <div className="prompt-library__header">
        <div className="prompt-library__tabs" role="tablist" aria-label="Prompt tools">
          <button
            type="button"
            role="tab"
            className={`prompt-library__tab${section === "library" ? " prompt-library__tab--active" : ""}`}
            aria-selected={section === "library"}
            onClick={() => setSection("library")}
          >
            Library
          </button>
          <button
            type="button"
            role="tab"
            className={`prompt-library__tab${section === "generator" ? " prompt-library__tab--active" : ""}`}
            aria-selected={section === "generator"}
            onClick={() => setSection("generator")}
          >
            Generator
          </button>
        </div>
        <button
          type="button"
          className="prompt-library__close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {section === "generator" ? (
        <PowerPromptPanel onClose={onClose} embedded />
      ) : (
        <>
      {/* Search + New */}
      <div className="prompt-library__search-row">
        <input
          ref={searchRef}
          type="text"
          className="prompt-library__search"
          placeholder="Search prompts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="prompt-library__new-btn"
          onClick={handleNew}
        >
          + New
        </button>
      </div>

      {/* List */}
      <div className="prompt-library__list">
        {filtered.length === 0 ? (
          <div className="prompt-library__empty">
            {query
              ? "No prompts match that search."
              : "No prompts yet. Hit + New to add one."}
          </div>
        ) : (
          filtered.map((p) => (
            <PromptCard
              key={p.id}
              prompt={p}
              copied={copiedId === p.id}
              onCopy={handleCopy}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {/* Copy toast */}
      {showToast && (
        <div className="prompt-library__toast">Copied to clipboard</div>
      )}

      {/* Edit / New modal — slides over the panel */}
      {editing.mode !== "none" && (
        <PromptEditModal
          initialTitle={editingPrompt?.title ?? ""}
          initialBody={editingPrompt?.body ?? ""}
          isNew={editing.mode === "new"}
          onSave={handleSave}
          onCancel={handleCancelEdit}
        />
      )}
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

interface PromptCardProps {
  prompt: Prompt;
  copied: boolean;
  onCopy: (p: Prompt) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function PromptCard({
  prompt,
  copied,
  onCopy,
  onEdit,
  onDelete,
}: PromptCardProps): JSX.Element {
  return (
    <div className="prompt-card">
      <div className="prompt-card__body">
        <div className="prompt-card__title">{prompt.title}</div>
        <div className="prompt-card__snippet">{prompt.body.slice(0, 72)}…</div>
      </div>
      <div className="prompt-card__actions">
        <button
          type="button"
          className={`prompt-card__btn prompt-card__btn--copy${copied ? " copied" : ""}`}
          onClick={() => onCopy(prompt)}
          title="Copy to clipboard"
        >
          {copied ? "✓" : "⎘"}
        </button>
        <button
          type="button"
          className="prompt-card__btn prompt-card__btn--edit"
          onClick={() => onEdit(prompt.id)}
          title="Edit"
        >
          ✎
        </button>
        <button
          type="button"
          className="prompt-card__btn prompt-card__btn--delete"
          onClick={() => onDelete(prompt.id)}
          title="Delete"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

interface PromptEditModalProps {
  initialTitle: string;
  initialBody: string;
  isNew: boolean;
  onSave: (title: string, body: string) => void;
  onCancel: () => void;
}

function PromptEditModal({
  initialTitle,
  initialBody,
  isNew,
  onSave,
  onCancel,
}: PromptEditModalProps): JSX.Element {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const canSave = title.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="prompt-edit-modal">
      <div className="prompt-edit-modal__title">
        {isNew ? "New Prompt" : "Edit Prompt"}
      </div>

      <div className="prompt-edit-field">
        <label className="prompt-edit-label">Title</label>
        <input
          ref={titleRef}
          type="text"
          className="prompt-edit-input"
          placeholder="Short descriptive name…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
        />
      </div>

      <div className="prompt-edit-field" style={{ flex: 1 }}>
        <label className="prompt-edit-label">Prompt</label>
        <textarea
          className="prompt-edit-textarea"
          placeholder="Write your prompt here…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSave) {
              onSave(title, body);
            }
          }}
          style={{ flex: 1 }}
        />
      </div>

      <div className="prompt-edit-modal__actions">
        <button
          type="button"
          className="prompt-edit-modal__cancel"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="prompt-edit-modal__save"
          onClick={() => onSave(title, body)}
          disabled={!canSave}
        >
          {isNew ? "Add Prompt" : "Save"}
        </button>
      </div>
    </div>
  );
}
