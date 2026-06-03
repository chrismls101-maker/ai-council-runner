import type { ArtifactTransformType } from "../../types/builderWorkspace";
import type { IivoArtifact } from "../../types/artifacts";
import { getTransformActions } from "../../utils/builderTransforms";

export interface ExecutePanelProps {
  artifact: IivoArtifact;
  onTransform: (transformType: ArtifactTransformType) => void;
  loading?: boolean;
}

export default function ExecutePanel({ artifact, onTransform, loading = false }: ExecutePanelProps) {
  const actions = getTransformActions(artifact.type);

  if (actions.length === 0) {
    return (
      <div className="execute-panel muted" data-testid="execute-panel">
        <p>No transform actions for this artifact type yet.</p>
      </div>
    );
  }

  return (
    <div className="execute-panel" data-testid="execute-panel">
      <h4>Turn this into…</h4>
      <p className="muted">Create a new business asset from this artifact (on demand).</p>
      <ul className="execute-actions">
        {actions.map((action) => (
          <li key={action.id}>
            <button
              type="button"
              className="btn ghost small execute-action-btn"
              disabled={loading}
              data-testid={`execute-transform-${action.id}`}
              onClick={() => onTransform(action.id)}
            >
              {action.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
