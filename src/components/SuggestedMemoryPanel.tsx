import type { SuggestedMemoryItem } from "../utils/suggestedMemory";

interface SuggestedMemoryPanelProps {
  suggestions: SuggestedMemoryItem[];
  onSave: (item: SuggestedMemoryItem) => void;
  onIgnore: (id: string) => void;
}

export default function SuggestedMemoryPanel({
  suggestions,
  onSave,
  onIgnore,
}: SuggestedMemoryPanelProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="suggested-memory-panel">
      <div className="suggested-memory-header">
        <strong>Suggested Memory</strong>
        <span className="muted">Save useful context from this run</span>
      </div>
      <ul className="suggested-memory-list">
        {suggestions.map((item) => (
          <li key={item.id} className="suggested-memory-item">
            <p>{item.label}</p>
            <div className="suggested-memory-actions">
              <button type="button" className="btn primary small" onClick={() => onSave(item)}>
                Save
              </button>
              <button type="button" className="btn small" onClick={() => onIgnore(item.id)}>
                Ignore
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
