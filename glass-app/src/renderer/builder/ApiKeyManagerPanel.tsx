import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { ApiKeyMeta } from "../../shared/ipc.ts";
import { SpendTrackerPanel } from "./SpendTrackerPanel.tsx";
import "./ApiKeyManagerPanel.css";

// ---------------------------------------------------------------------------
// Popular services list
// ---------------------------------------------------------------------------

const POPULAR_SERVICES = [
  "Anthropic",
  "OpenAI",
  "ElevenLabs",
  "Deepgram",
  "Replicate",
  "Vercel",
  "Supabase",
  "GitHub",
  "Stripe",
  "Resend",
  "AssemblyAI",
  "Pinecone",
  "Custom",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function maskValue(): string {
  return "••••••••••••";
}

function envLabel(env: ApiKeyMeta["environment"]): string {
  return env === "any" ? "any" : env;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EditState {
  meta: ApiKeyMeta;
  value: string; // raw value (empty when editing existing without revealing)
  isNew: boolean;
}

interface CardRevealState {
  [id: string]: { value: string; loading: boolean };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface KeyCardProps {
  meta: ApiKeyMeta;
  revealed: { value: string; loading: boolean } | undefined;
  onReveal: (id: string) => void;
  onHide: (id: string) => void;
  onCopy: (id: string) => void;
  copiedId: string | null;
  onEdit: (meta: ApiKeyMeta) => void;
  onDelete: (meta: ApiKeyMeta) => void;
}

function KeyCard({
  meta,
  revealed,
  onReveal,
  onHide,
  onCopy,
  copiedId,
  onEdit,
  onDelete,
}: KeyCardProps): JSX.Element {
  const isRevealed = !!revealed?.value;
  const isLoading = !!revealed?.loading;

  return (
    <div className="akmgr-card">
      <div className="akmgr-card-top">
        <div className="akmgr-card-meta">
          <span className="akmgr-card-service">{meta.service}</span>
          {meta.label && (
            <span className="akmgr-card-label">{meta.label}</span>
          )}
        </div>
        <div className="akmgr-card-actions">
          <span
            className={`akmgr-env-badge akmgr-env-badge--${meta.environment}`}
          >
            {envLabel(meta.environment)}
          </span>
          <button
            type="button"
            className="akmgr-icon-btn"
            title="Edit"
            onClick={() => onEdit(meta)}
          >
            ✎
          </button>
          <button
            type="button"
            className="akmgr-icon-btn akmgr-icon-btn--danger"
            title="Delete"
            onClick={() => onDelete(meta)}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="akmgr-card-bottom">
        {isRevealed ? (
          <span className="akmgr-revealed-value">{revealed!.value}</span>
        ) : (
          <span className="akmgr-masked-value">
            {isLoading ? "decrypting…" : maskValue()}
          </span>
        )}

        <button
          type="button"
          className="akmgr-icon-btn"
          title={isRevealed ? "Hide" : "Reveal"}
          onClick={() => (isRevealed ? onHide(meta.id) : onReveal(meta.id))}
        >
          {isRevealed ? "🙈" : "👁"}
        </button>

        <button
          type="button"
          className={`akmgr-icon-btn${copiedId === meta.id ? " akmgr-icon-btn--copied" : ""}`}
          title="Copy to clipboard"
          onClick={() => onCopy(meta.id)}
        >
          {copiedId === meta.id ? "✓" : "⎘"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit modal
// ---------------------------------------------------------------------------

interface EditModalProps {
  state: EditState;
  onChange: (patch: Partial<EditState>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

function EditModal({
  state,
  onChange,
  onSave,
  onCancel,
  saving,
}: EditModalProps): JSX.Element {
  const valueRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    valueRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === "Escape") onCancel();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSave();
    },
    [onCancel, onSave],
  );

  const canSave =
    (state.meta.service === "Custom"
      ? state.meta.label.trim().length > 0
      : state.meta.service.trim().length > 0) &&
    (state.isNew ? state.value.trim().length > 0 : true);

  return (
    <div className="akmgr-modal-backdrop" onKeyDown={handleKeyDown}>
      <div className="akmgr-modal">
        <div className="akmgr-modal-title">
          {state.isNew ? "Add API Key" : `Edit — ${state.meta.service}`}
        </div>

        {/* Service + Environment row */}
        <div className="akmgr-field-row">
          <div className="akmgr-field">
            <label className="akmgr-label">Service</label>
            <select
              className="akmgr-select"
              value={state.meta.service}
              onChange={(e) =>
                onChange({
                  meta: { ...state.meta, service: e.target.value },
                })
              }
            >
              {POPULAR_SERVICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              {!POPULAR_SERVICES.includes(state.meta.service) && (
                <option value={state.meta.service}>{state.meta.service}</option>
              )}
            </select>
          </div>

          {state.meta.service === "Custom" && (
            <div className="akmgr-field">
              <label className="akmgr-label">Name</label>
              <input
                className="akmgr-input"
                placeholder="My Service"
                value={state.meta.label}
                onChange={(e) =>
                  onChange({
                    meta: { ...state.meta, label: e.target.value },
                  })
                }
              />
            </div>
          )}

          <div className="akmgr-field" style={{ maxWidth: 90 }}>
            <label className="akmgr-label">Env</label>
            <select
              className="akmgr-select"
              value={state.meta.environment}
              onChange={(e) =>
                onChange({
                  meta: {
                    ...state.meta,
                    environment: e.target.value as ApiKeyMeta["environment"],
                  },
                })
              }
            >
              <option value="any">any</option>
              <option value="dev">dev</option>
              <option value="prod">prod</option>
            </select>
          </div>
        </div>

        {/* Label (optional, not shown for Custom since it overlaps) */}
        {state.meta.service !== "Custom" && (
          <div className="akmgr-field">
            <label className="akmgr-label">Label (optional)</label>
            <input
              className="akmgr-input"
              placeholder="e.g. personal project"
              value={state.meta.label}
              onChange={(e) =>
                onChange({ meta: { ...state.meta, label: e.target.value } })
              }
            />
          </div>
        )}

        {/* Key value */}
        <div className="akmgr-field">
          <label className="akmgr-label">
            {state.isNew ? "API Key" : "New Value (leave blank to keep current)"}
          </label>
          <input
            ref={valueRef}
            className="akmgr-input akmgr-input--mono"
            type="password"
            placeholder={state.isNew ? "Paste key here…" : "••••••••"}
            value={state.value}
            onChange={(e) => onChange({ value: e.target.value })}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="akmgr-modal-footer">
          <button type="button" className="akmgr-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="akmgr-btn-save"
            onClick={onSave}
            disabled={!canSave || saving}
          >
            {saving ? "Saving…" : "Save ⌘↵"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface ApiKeyManagerPanelProps {
  onClose: () => void;
}

type ApiKeyManagerSection = "keys" | "spend";

export function ApiKeyManagerPanel({
  onClose,
}: ApiKeyManagerPanelProps): JSX.Element {
  const [section, setSection] = useState<ApiKeyManagerSection>("keys");
  const [keys, setKeys] = useState<ApiKeyMeta[]>([]);
  const [query, setQuery] = useState("");
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<CardRevealState>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [encryptionUnavailable, setEncryptionUnavailable] = useState(false);

  const showToast = useCallback((msg: string): void => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  // ── Load keys on mount ────────────────────────────────────────────────────
  const reload = useCallback(async (): Promise<void> => {
    const res = await window.glass.apiKeyList();
    setKeys(res.keys);
    setEncryptionUnavailable(res.encryptionAvailable === false);
    if (res.error) showToast(res.error);
  }, [showToast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = query.trim()
    ? keys.filter(
        (k) =>
          k.service.toLowerCase().includes(query.toLowerCase()) ||
          k.label.toLowerCase().includes(query.toLowerCase()),
      )
    : keys;

  // ── Reveal / hide ─────────────────────────────────────────────────────────
  const handleReveal = useCallback(async (id: string): Promise<void> => {
    setRevealed((prev) => ({ ...prev, [id]: { value: "", loading: true } }));
    const res = await window.glass.apiKeyGetValue(id);
    if (!res.value) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      showToast("Could not decrypt key");
      return;
    }
    setRevealed((prev) => ({
      ...prev,
      [id]: { value: res.value!, loading: false },
    }));
  }, [showToast]);

  const handleHide = useCallback((id: string): void => {
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // ── Copy ──────────────────────────────────────────────────────────────────
  const handleCopy = useCallback(
    async (id: string): Promise<void> => {
      // If already revealed use cached value; otherwise fetch
      let value = revealed[id]?.value;
      if (!value) {
        const res = await window.glass.apiKeyGetValue(id);
        value = res.value ?? "";
      }
      if (!value) {
        showToast("Could not decrypt key");
        return;
      }
      await window.glass.writeClipboard(value);
      setCopiedId(id);
      showToast("Copied to clipboard");
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    },
    [revealed, showToast],
  );

  // ── Open add modal ────────────────────────────────────────────────────────
  const handleAdd = useCallback((): void => {
    setEditState({
      isNew: true,
      value: "",
      meta: {
        id: generateId(),
        service: POPULAR_SERVICES[0]!,
        label: "",
        environment: "any",
        createdAt: Date.now(),
        lastUsedAt: null,
      },
    });
  }, []);

  // ── Open edit modal ───────────────────────────────────────────────────────
  const handleEdit = useCallback((meta: ApiKeyMeta): void => {
    setEditState({ isNew: false, value: "", meta });
  }, []);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (meta: ApiKeyMeta): Promise<void> => {
      const label = meta.label.trim() || meta.service;
      if (!window.confirm(`Delete "${label}" key? This cannot be undone.`)) return;
      const res = await window.glass.apiKeyDelete(meta.id);
      if (!res.ok) {
        showToast(res.error ?? "Delete failed");
        return;
      }
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[meta.id];
        return next;
      });
      void reload();
    },
    [reload, showToast],
  );

  // ── Save from modal ───────────────────────────────────────────────────────
  const handleSave = useCallback(async (): Promise<void> => {
    if (!editState) return;
    if (!editState.meta.service.trim()) return;
    // For edit with no new value, we need the existing value — fetch it.
    let valueToSave = editState.value;
    if (!editState.isNew && !valueToSave) {
      const res = await window.glass.apiKeyGetValue(editState.meta.id);
      valueToSave = res.value ?? "";
    }
    if (!valueToSave) return;

    setSaving(true);
    const res = await window.glass.apiKeySave({
      meta: {
        ...editState.meta,
        // For Custom service, use label as the display name if provided
        service:
          editState.meta.service === "Custom" && editState.meta.label
            ? editState.meta.label
            : editState.meta.service,
        label:
          editState.meta.service === "Custom" ? "" : editState.meta.label,
      },
      value: valueToSave,
    });
    setSaving(false);

    if (res.ok) {
      setEditState(null);
      void reload();
    } else {
      showToast(res.error ?? "Save failed");
    }
  }, [editState, reload, showToast]);

  // ── Keyboard: Escape closes modal or panel ────────────────────────────────
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent): void => {
      if (e.key === "Escape" && !editState) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editState, onClose]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div className="akmgr-header">
        <div className="akmgr-tabs" role="tablist" aria-label="API keys and spend">
          <button
            type="button"
            role="tab"
            className={`akmgr-tab${section === "keys" ? " akmgr-tab--active" : ""}`}
            aria-selected={section === "keys"}
            onClick={() => setSection("keys")}
          >
            Keys
          </button>
          <button
            type="button"
            role="tab"
            className={`akmgr-tab${section === "spend" ? " akmgr-tab--active" : ""}`}
            aria-selected={section === "spend"}
            onClick={() => setSection("spend")}
          >
            Spend
          </button>
        </div>
        <div className="akmgr-header-actions">
          {section === "keys" ? (
            <button
              type="button"
              className="akmgr-btn-add"
              onClick={handleAdd}
              disabled={encryptionUnavailable}
            >
              <span>+</span> Add
            </button>
          ) : null}
          <button type="button" className="akmgr-btn-close" onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      {section === "spend" ? (
        <SpendTrackerPanel embedded />
      ) : (
        <>
      {/* Search */}
      {encryptionUnavailable && (
        <div className="akmgr-warning">
          Secure storage is unavailable on this system. Keys cannot be saved until OS encryption is enabled.
        </div>
      )}

      <div className="akmgr-search-wrap">
        <input
          className="akmgr-search"
          placeholder="Search services…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
      </div>

      {/* List */}
      <div className="akmgr-list">
        {filtered.length === 0 ? (
          <div className="akmgr-empty">
            <span className="akmgr-empty-icon">🗝</span>
            {query ? "No matches" : "No keys yet — click + Add"}
          </div>
        ) : (
          filtered.map((meta) => (
            <KeyCard
              key={meta.id}
              meta={meta}
              revealed={revealed[meta.id]}
              onReveal={handleReveal}
              onHide={handleHide}
              onCopy={handleCopy}
              copiedId={copiedId}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {/* Edit / Add modal */}
      {editState && (
        <EditModal
          state={editState}
          onChange={(patch) =>
            setEditState((prev) => (prev ? { ...prev, ...patch } : prev))
          }
          onSave={handleSave}
          onCancel={() => setEditState(null)}
          saving={saving}
        />
      )}

      {/* Toast */}
      {toast && <div className="akmgr-toast">{toast}</div>}
        </>
      )}
    </div>
  );
}
