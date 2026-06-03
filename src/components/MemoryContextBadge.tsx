import { useState } from "react";
import {
  MEMORY_TYPE_LABELS,
  contextLabelFromMemories,
  type IncludedMemorySummary,
} from "../types/memory";
import { MEMORY_UNAVAILABLE_MESSAGE } from "../constants/publicMessages";

interface MemoryContextBadgeProps {
  memories: IncludedMemorySummary[];
  memoryMode?: string;
  onRemove?: (id: string) => void;
  compact?: boolean;
  /** Hide badge when no memories are included (e.g. Direct Answer main view). */
  hideWhenEmpty?: boolean;
  /** Smaller inline label when memories are active. */
  subtle?: boolean;
}

export default function MemoryContextBadge({
  memories,
  memoryMode,
  onRemove,
  compact = false,
  hideWhenEmpty = false,
  subtle = false,
}: MemoryContextBadgeProps) {
  const [open, setOpen] = useState(false);
  const active = memories.length > 0;
  const label = active ? contextLabelFromMemories(memories) : "";

  if (hideWhenEmpty && !active) {
    return null;
  }

  if (memoryMode === "off") {
    if (hideWhenEmpty) return null;
    return (
      <div
        className={`memory-context-badge inactive${compact ? " compact" : ""}${subtle ? " subtle" : ""}`}
        data-testid="memory-context-badge"
      >
        <span>{MEMORY_UNAVAILABLE_MESSAGE}</span>
      </div>
    );
  }

  if (subtle && active) {
    return (
      <div
        className={`memory-context-badge active subtle${compact ? " compact" : ""}`}
        data-testid="memory-context-badge"
      >
        <button
          type="button"
          className="memory-context-badge-btn memory-context-subtle-btn"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          Context used · {memories.length}{" "}
          {memories.length === 1 ? "memory" : "memories"}
        </button>
        {open && (
          <div className="memory-context-panel">
            <div className="memory-context-panel-header">
              <strong>Included Memories</strong>
              <button type="button" className="btn-icon" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <ul className="memory-context-list">
              {memories.map((memory) => (
                <li key={memory.id} className="memory-context-item">
                  <div>
                    <span className="memory-context-title">{memory.title}</span>
                    {memory.projectName && (
                      <span className="memory-context-project">{memory.projectName}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`memory-context-badge${active ? " active" : " inactive"}${compact ? " compact" : ""}`}
      data-testid="memory-context-badge"
    >
      <button
        type="button"
        className="memory-context-badge-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {active ? (
          <>
            <span className="memory-context-label">Context active:</span>
            <strong>{label}</strong>
            <span className="memory-context-count">
              Using {memories.length} {memories.length === 1 ? "memory" : "memories"}
            </span>
          </>
        ) : (
          <span>{MEMORY_UNAVAILABLE_MESSAGE}</span>
        )}
      </button>

      {open && active && (
        <div className="memory-context-panel">
          <div className="memory-context-panel-header">
            <strong>Included Memories</strong>
            <button type="button" className="btn-icon" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
          <ul className="memory-context-list">
            {memories.map((memory) => (
              <li key={memory.id} className="memory-context-item">
                <div>
                  <span className={`memory-type-badge type-${memory.type}`}>
                    {MEMORY_TYPE_LABELS[memory.type as keyof typeof MEMORY_TYPE_LABELS] ??
                      memory.type}
                  </span>
                  <span className="memory-context-title">{memory.title}</span>
                  {memory.projectName && (
                    <span className="memory-context-project">{memory.projectName}</span>
                  )}
                </div>
                {onRemove && (
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => onRemove(memory.id)}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
