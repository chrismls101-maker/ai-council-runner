import type { ImageQualityScore } from "../../types/imageStudio";

export interface ImageQualityPanelProps {
  quality: ImageQualityScore | null;
}

export default function ImageQualityPanel({ quality }: ImageQualityPanelProps) {
  if (!quality) return null;
  return (
    <div className="image-quality-panel" data-testid="image-quality-panel">
      <h4>Visual quality</h4>
      <ul className="image-quality-scores">
        <li>Overall: {quality.overall}/100</li>
        <li>Purpose fit: {quality.purposeFit}/100</li>
        <li>Brand fit: {quality.brandFit}/100</li>
        <li>Export readiness: {quality.exportReadiness}/100</li>
      </ul>
      {quality.warnings.length > 0 && (
        <ul className="image-quality-warnings">
          {quality.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      {quality.visualQa?.ran && (
        <div className="image-visual-qa" data-testid="image-visual-qa-section">
          <h5>Visual QA</h5>
          {quality.visualQa.provider && (
            <p className="muted">Provider: {quality.visualQa.provider}</p>
          )}
          {typeof quality.visualQa.briefMatchScore === "number" && (
            <p>Brief match: {quality.visualQa.briefMatchScore}/100</p>
          )}
          {quality.visualQa.findings.length > 0 && (
            <ul className="image-visual-qa-findings">
              {quality.visualQa.findings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          )}
          {quality.visualQa.warnings.length > 0 && (
            <ul className="image-visual-qa-warnings">
              {quality.visualQa.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
