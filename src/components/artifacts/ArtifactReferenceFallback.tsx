export interface ArtifactReferenceFallbackProps {
  state: "loading" | "missing";
  onShowRawAnswer?: () => void;
}

export default function ArtifactReferenceFallback({
  state,
  onShowRawAnswer,
}: ArtifactReferenceFallbackProps) {
  return (
    <div
      className="artifact-reference-fallback artifact-glass-card"
      data-testid={state === "loading" ? "artifact-reference-loading" : "artifact-reference-missing"}
    >
      <p className="muted">
        {state === "loading"
          ? "Artifact stored separately — loading…"
          : "Artifact could not be restored. Show raw answer."}
      </p>
      {state === "missing" && onShowRawAnswer && (
        <button type="button" className="btn ghost small" onClick={onShowRawAnswer}>
          Show raw answer
        </button>
      )}
    </div>
  );
}
