import type { ArtifactQualityScore } from "../../utils/artifactQuality";

export interface ArtifactQualityPanelProps {
  quality: ArtifactQualityScore;
}

export default function ArtifactQualityPanel({ quality }: ArtifactQualityPanelProps) {
  return (
    <div className="artifact-quality-panel" data-testid="artifact-quality-panel">
      <div className="quality-header">
        <h4>Quality Score</h4>
        <span className="quality-overall" data-testid="quality-overall-score">
          {quality.overall}
        </span>
      </div>
      <ul className="quality-dimensions">
        {quality.dimensions.map((d) => (
          <li key={d.label}>
            <span>{d.label}</span>
            <span className="quality-dim-score">{d.score}</span>
            <p className="muted">{d.reason}</p>
          </li>
        ))}
      </ul>
      {quality.missingPieces.length > 0 && (
        <div className="quality-block">
          <h5>Missing</h5>
          <ul>
            {quality.missingPieces.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {quality.risks.length > 0 && (
        <div className="quality-block">
          <h5>Risks</h5>
          <ul>
            {quality.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
