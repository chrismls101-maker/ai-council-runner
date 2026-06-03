import { useCallback, useEffect, useMemo, useState } from "react";
import { withIivoWordmark } from "../utils/brandText";
import {
  attachedFromSavedItem,
  contextLibraryFilterLabel,
  contextTypeLabel,
  getLensCaptureTypeLabel,
  isLensContextItem,
  resolveLensCaptureType,
  contextScreenshotUrl,
  sourceConfidenceDetail,
  sourceConfidenceFromType,
  sourceConfidenceLabel,
  type AttachedContextItem,
  type ContextItem,
  type ContextLibraryFilter,
} from "../types/contextBridge";
import {
  deleteContextItem,
  fetchContextItems,
  saveContextToMemory,
} from "../utils/contextBridgeApi";

interface ContextLibraryPanelProps {
  onAttach: (item: AttachedContextItem) => void;
  onFeedback: (message: string) => void;
  onAnalyzeScreenshot?: (item: ContextItem) => void;
  visionConfigured?: boolean;
}

export default function ContextLibraryPanel({
  onAttach,
  onFeedback,
  onAnalyzeScreenshot,
  visionConfigured = false,
}: ContextLibraryPanelProps) {
  const [items, setItems] = useState<ContextItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ContextLibraryFilter>("all");
  const [projectFilter, setProjectFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchContextItems();
      setItems(next);
    } catch {
      onFeedback("Could not load context library");
    } finally {
      setLoading(false);
    }
  }, [onFeedback]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const projects = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.project?.trim()) set.add(item.project.trim());
    }
    return [...set].sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "pasted_text" && item.type !== "pasted_text") return false;
      if (filter === "url" && item.type !== "url") return false;
      if (filter === "screenshot" && item.type !== "screenshot") return false;
      if (filter === "evidence" && item.type !== "evidence") return false;
      if (filter === "saved_to_memory" && !item.savedToMemory) return false;
      if (projectFilter && item.project !== projectFilter) return false;
      if (!q) return true;
      const hay = [
        item.title,
        item.contentText,
        item.sourceUrl,
        item.project,
        item.tags.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, search, filter, projectFilter]);

  const selected = filtered.find((i) => i.id === selectedId) ?? filtered[0] ?? null;

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this context item?")) return;
    setBusy(`delete-${id}`);
    try {
      await deleteContextItem(id);
      onFeedback("Context item deleted");
      await refresh();
      if (selectedId === id) setSelectedId(null);
    } catch {
      onFeedback("Delete failed");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveMemory = async (id: string) => {
    setBusy(`memory-${id}`);
    try {
      await saveContextToMemory(id);
      onFeedback("Saved to Memory as Evidence");
      await refresh();
    } catch {
      onFeedback("Save to Memory failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="context-library-panel" data-testid="context-library-panel">
      <header className="panel-page-header">
        <h1>Context Library</h1>
        <p className="panel-page-subtitle">
          Saved pasted context, imported URLs, and evidence you chose to keep. Attached-only context
          is not stored here unless you save it.
        </p>
      </header>

      <div className="context-library-toolbar">
        <input
          type="search"
          placeholder="Search context…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="context-library-search"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as ContextLibraryFilter)}
          data-testid="context-library-type-filter"
        >
          {(["all", "pasted_text", "url", "screenshot", "evidence", "saved_to_memory"] as const).map(
            (value) => (
            <option key={value} value={value}>
              {contextLibraryFilterLabel(value)}
            </option>
          ))}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          data-testid="context-library-project-filter"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="muted">Loading context…</p>
      ) : filtered.length === 0 ? (
        <p className="muted">No saved context yet. Use + → Paste Context or Import URL.</p>
      ) : (
        <div className="context-library-layout">
          <ul className="context-library-list" data-testid="context-library-list">
            {filtered.map((item) => {
              const confidence = sourceConfidenceFromType(item.type);
              const deleting = busy === `delete-${item.id}`;
              return (
                <li key={item.id} className="context-library-list-row">
                  <button
                    type="button"
                    className={`context-library-item${selected?.id === item.id ? " active" : ""}`}
                    data-testid={`context-library-item-${item.id}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <strong data-testid="context-library-item-title">{item.title}</strong>
                    {isLensContextItem(item) && (
                      <span className="context-lens-badge" data-testid="context-lens-badge">
                        {withIivoWordmark("Captured by IIVO Lens", "lens-badge")}
                      </span>
                    )}
                    <span className="muted">
                      {contextTypeLabel(item.type)} · {sourceConfidenceLabel(confidence)}
                    </span>
                    <span className="muted context-library-item-date">
                      {new Date(item.createdAt).toLocaleDateString()}
                      {item.savedToMemory ? " · Saved to Memory" : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn-icon danger context-library-item-delete"
                    aria-label={`Delete ${item.title}`}
                    title="Delete"
                    disabled={busy !== null}
                    data-testid={`context-library-item-delete-${item.id}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDelete(item.id);
                    }}
                  >
                    {deleting ? "…" : "Delete"}
                  </button>
                </li>
              );
            })}
          </ul>

          {selected && (
            <div className="context-library-detail" data-testid="context-library-detail">
              <h2 data-testid="context-library-detail-title">{selected.title}</h2>
              {isLensContextItem(selected) && (
                <p className="context-lens-badge" data-testid="context-lens-badge-detail">
                  {withIivoWordmark("Captured by IIVO Lens", "lens-badge-detail")}
                </p>
              )}
              {isLensContextItem(selected) && resolveLensCaptureType(selected) && (
                <p className="context-lens-meta" data-testid="context-lens-capture-type">
                  Capture type: {getLensCaptureTypeLabel(resolveLensCaptureType(selected)!)}
                </p>
              )}
              {isLensContextItem(selected) && selected.capturedAt && (
                <p className="context-lens-meta muted" data-testid="context-lens-captured-at">
                  Captured: {new Date(selected.capturedAt).toLocaleString()}
                </p>
              )}
              {isLensContextItem(selected) && selected.truncated && (
                <p className="context-lens-meta context-truncation-warning" data-testid="context-lens-truncated">
                  Truncated: yes
                  {selected.originalTextLength != null && selected.sentTextLength != null
                    ? ` (sent ${selected.sentTextLength.toLocaleString()} / original ${selected.originalTextLength.toLocaleString()} chars)`
                    : ""}
                </p>
              )}
              {isLensContextItem(selected) && selected.truncated === false && (
                <p className="context-lens-meta muted" data-testid="context-lens-truncated">
                  Truncated: no
                </p>
              )}
              {selected.type === "screenshot" && selected.screenshotPath && (
                <div className="context-screenshot-preview" data-testid="context-screenshot-preview">
                  <img
                    src={contextScreenshotUrl(selected.id)}
                    alt={`Screenshot: ${selected.title}`}
                    className="context-screenshot-thumb"
                  />
                  {selected.imageSizeBytes != null && (
                    <p className="context-lens-meta muted" data-testid="context-screenshot-size">
                      Image size: {(selected.imageSizeBytes / 1024).toFixed(1)} KB
                      {selected.imageMimeType ? ` (${selected.imageMimeType})` : ""}
                    </p>
                  )}
                </div>
              )}
              <p className="muted">
                {contextTypeLabel(selected.type)} · {new Date(selected.createdAt).toLocaleString()}
              </p>
              <p className="context-library-confidence" data-testid="context-library-confidence">
                Source: {sourceConfidenceLabel(sourceConfidenceFromType(selected.type))}
              </p>
              <p className="context-library-confidence-detail muted">
                Confidence: {sourceConfidenceDetail(sourceConfidenceFromType(selected.type))}
              </p>
              <p className="context-library-memory-status" data-testid="context-library-memory-status">
                {selected.savedToMemory ? "Saved to Memory: yes" : "Saved to Memory: no"}
              </p>
              {selected.sourceUrl && (
                <p className="context-library-url">
                  <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">
                    {selected.sourceUrl}
                  </a>
                </p>
              )}
              {selected.importedAt && (
                <p className="muted">Extracted: {new Date(selected.importedAt).toLocaleString()}</p>
              )}
              {selected.tags.length > 0 && (
                <p className="context-library-tags">{selected.tags.join(", ")}</p>
              )}
              <pre className="context-library-preview">{selected.contentText.slice(0, 4000)}</pre>
              <div className="context-library-actions">
                <button
                  type="button"
                  className="btn ghost small"
                  data-testid="context-library-attach-btn"
                  onClick={() => {
                    onAttach(attachedFromSavedItem(selected));
                    onFeedback("Attached to composer");
                  }}
                >
                  Attach to prompt
                </button>
                {selected.type === "screenshot" && (
                  <>
                    <button
                      type="button"
                      className="btn ghost small"
                      data-testid="context-library-analyze-screenshot-btn"
                      onClick={() => {
                        if (onAnalyzeScreenshot) {
                          onAnalyzeScreenshot(selected);
                        } else {
                          onAttach(attachedFromSavedItem(selected));
                          onFeedback("Screenshot attached — review prompt and send when ready.");
                        }
                      }}
                    >
                      Analyze Screenshot
                    </button>
                    <p className="muted small context-library-vision-note">
                      {visionConfigured
                        ? "Vision analysis available when you send from the composer."
                        : "Visual analysis is not configured — screenshot is attached as evidence only."}
                    </p>
                  </>
                )}
                {!selected.savedToMemory && (
                  <button
                    type="button"
                    className="btn ghost small"
                    disabled={busy !== null}
                    data-testid="context-library-memory-btn"
                    onClick={() => void handleSaveMemory(selected.id)}
                  >
                    Save to Memory
                  </button>
                )}
                <button
                  type="button"
                  className="btn danger ghost small"
                  disabled={busy !== null}
                  data-testid="context-library-delete-btn"
                  onClick={() => void handleDelete(selected.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
