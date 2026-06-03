import type { BuilderContextItem } from "../../types/builderWorkspace";

export interface BuilderContextPanelProps {
  items: BuilderContextItem[];
}

export default function BuilderContextPanel({ items }: BuilderContextPanelProps) {
  if (items.length === 0) {
    return (
      <div className="builder-context-panel muted" data-testid="builder-context-panel">
        <h4>Context used</h4>
        <p>No external context used.</p>
      </div>
    );
  }

  return (
    <div className="builder-context-panel" data-testid="builder-context-panel">
      <h4>Context used</h4>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span className={`context-kind ${item.kind}`}>{item.kind}</span>
            <span>{item.label}</span>
            {item.relevance && <p className="muted">{item.relevance}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
