import { useCallback, useEffect, useMemo, useState } from "react";
import { withIivoWordmark } from "../utils/brandText";
import SaveMemoryModal from "./SaveMemoryModal";
import {
  MEMORY_FILTER_OPTIONS,
  MEMORY_TYPE_LABELS,
  memoryDisplayTitle,
  memoryPreview,
  memoryProjectName,
  type Memory,
  type MemoryType,
  type SaveMemoryDraft,
} from "../types/memory";

interface MemoryVaultProps {
  onRefresh?: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function draftFromMemory(memory: Memory): SaveMemoryDraft {
  const base = {
    type: memory.type,
    projectName: memoryProjectName(memory) ?? "",
    title: "",
    content: "",
    tags: "",
    sourceUrl: "",
    relatedRunId: "",
    decision: "",
    reason: "",
    confidence: "medium" as const,
    decisionStatus: "active" as const,
  };

  switch (memory.type) {
    case "project_fact":
      return {
        ...base,
        title: memory.title,
        content: memory.content,
        tags: memory.tags.join(", "),
      };
    case "decision":
      return {
        ...base,
        projectName: memory.projectName,
        decision: memory.decision,
        reason: memory.reason,
        content: memory.reason,
        title: memory.decision.slice(0, 80),
        confidence: memory.confidence,
        decisionStatus: memory.status,
        relatedRunId: memory.relatedRunId ?? "",
      };
    case "outcome":
      return {
        ...base,
        projectName: memory.projectName,
        content: memory.notes ?? memory.resultMetric ?? "",
        title: `${memory.projectName} outcome`,
        relatedRunId: memory.relatedRunId ?? "",
      };
    case "preference":
      return {
        ...base,
        title: memory.title,
        content: memory.content,
        projectName: memory.projectName ?? "",
      };
    case "evidence":
      return {
        ...base,
        title: memory.title,
        content: memory.content,
        sourceUrl: memory.sourceUrl ?? "",
        relatedRunId: memory.relatedRunId ?? "",
        projectName: memory.projectName ?? "",
      };
    default:
      return base;
  }
}

function memoryPayloadFromDraft(draft: SaveMemoryDraft) {
  const tags = draft.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  switch (draft.type) {
    case "project_fact":
      return {
        type: "project_fact" as const,
        projectName: draft.projectName.trim(),
        title: draft.title.trim(),
        content: draft.content.trim(),
        tags,
      };
    case "decision":
      return {
        type: "decision" as const,
        projectName: draft.projectName.trim(),
        decision: (draft.decision || draft.title).trim(),
        reason: (draft.reason || draft.content).trim(),
        confidence: draft.confidence ?? "medium",
        status: draft.decisionStatus ?? "active",
        relatedRunId: draft.relatedRunId.trim() || undefined,
      };
    case "outcome":
      return {
        type: "outcome" as const,
        projectName: draft.projectName.trim(),
        relatedRunId: draft.relatedRunId.trim() || undefined,
        outcomeStatus: "in_progress" as const,
        notes: draft.content.trim() || undefined,
        resultMetric: undefined,
      };
    case "preference":
      return {
        type: "preference" as const,
        title: draft.title.trim(),
        content: draft.content.trim(),
        scope: draft.projectName.trim() ? ("project" as const) : ("global" as const),
        projectName: draft.projectName.trim() || undefined,
      };
    case "evidence":
      return {
        type: "evidence" as const,
        title: draft.title.trim(),
        content: draft.content.trim(),
        sourceUrl: draft.sourceUrl.trim() || undefined,
        sourceType: "manual",
        relatedRunId: draft.relatedRunId.trim() || undefined,
        projectName: draft.projectName.trim() || undefined,
      };
    default:
      return null;
  }
}

export default function MemoryVault({ onRefresh }: MemoryVaultProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [projectNames, setProjectNames] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MemoryType | "all">("all");
  const [projectFilter, setProjectFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Memory | null>(null);
  const [initialDraft, setInitialDraft] = useState<Partial<SaveMemoryDraft>>();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/memory");
      const data = (await res.json()) as {
        memories: Memory[];
        projectNames: string[];
      };
      setMemories(data.memories ?? []);
      setProjectNames(data.projectNames ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    let list = [...memories];
    if (typeFilter !== "all") {
      list = list.filter((m) => m.type === typeFilter);
    }
    if (projectFilter.trim()) {
      const p = projectFilter.trim().toLowerCase();
      list = list.filter((m) => memoryProjectName(m)?.toLowerCase().includes(p));
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (m) =>
          memoryDisplayTitle(m).toLowerCase().includes(q) ||
          memoryPreview(m).toLowerCase().includes(q),
      );
    }
    return list;
  }, [memories, typeFilter, projectFilter, query]);

  const openCreate = () => {
    setEditing(null);
    setInitialDraft(undefined);
    setModalOpen(true);
  };

  const openEdit = (memory: Memory) => {
    setEditing(memory);
    setInitialDraft(draftFromMemory(memory));
    setModalOpen(true);
  };

  const handleSave = async (draft: SaveMemoryDraft) => {
    const payload = memoryPayloadFromDraft(draft);
    if (!payload) return;

    if (editing) {
      await fetch(`/api/memory/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    setModalOpen(false);
    setEditing(null);
    await refresh();
    onRefresh?.();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this memory?")) return;
    await fetch(`/api/memory/${id}`, { method: "DELETE" });
    await refresh();
    onRefresh?.();
  };

  return (
    <div className="memory-vault">
      <div className="memory-vault-toolbar">
        <input
          type="search"
          className="sidebar-search"
          placeholder="Search memories…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="btn primary small memory-create-btn" onClick={openCreate}>
          + Create memory
        </button>
      </div>

      <div className="memory-filter-row">
        {MEMORY_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`filter-chip ${typeFilter === opt.value ? "active" : ""}`}
            onClick={() => setTypeFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {projectNames.length > 0 && (
        <label className="memory-project-filter">
          <span>Project</span>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="">All projects</option>
            {projectNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="memory-privacy-note muted">
        Memory is stored in your workspace and can be edited or deleted.
      </p>

      {loading ? (
        <p className="muted">Loading memories…</p>
      ) : filtered.length === 0 ? (
        <div className="sidebar-empty">
          <p className="empty-title">No memories yet.</p>
          <p className="empty-hint">
            {withIivoWordmark(
              "Save important context so IIVO can use it in future decisions.",
              "memory-hint",
            )}
          </p>
        </div>
      ) : (
        <ul className="memory-card-list">
          {filtered.map((memory) => (
            <li key={memory.id} className="memory-card">
              <div className="memory-card-top">
                <span className={`memory-type-badge type-${memory.type}`}>
                  {MEMORY_TYPE_LABELS[memory.type]}
                </span>
                {memoryProjectName(memory) && (
                  <span className="memory-project">{memoryProjectName(memory)}</span>
                )}
              </div>
              <h3 className="memory-card-title">{memoryDisplayTitle(memory)}</h3>
              <p className="memory-card-preview">{memoryPreview(memory)}</p>
              {memory.type === "project_fact" && memory.tags.length > 0 && (
                <div className="memory-tags">
                  {memory.tags.map((tag) => (
                    <span key={tag} className="memory-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {memory.type === "evidence" && memory.sourceUrl && (
                <a
                  href={memory.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="memory-source-link"
                >
                  {memory.sourceUrl}
                </a>
              )}
              {memory.type === "decision" && memory.relatedRunId && (
                <p className="memory-meta muted">Run: {memory.relatedRunId.slice(0, 8)}…</p>
              )}
              <div className="memory-card-footer">
                <span className="muted">
                  Updated {formatDate(memory.updatedAt)}
                </span>
                <div className="memory-card-actions">
                  <button type="button" className="btn-icon" onClick={() => openEdit(memory)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-icon danger"
                    onClick={() => handleDelete(memory.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalOpen && (
        <SaveMemoryModal
          initialDraft={initialDraft}
          editing={Boolean(editing)}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
