import type { DecisionQuality } from "../types/decisionQuality";
import { riskBadgeClass } from "../utils/decisionQualityDisplay";

interface DecisionQualitySummaryProps {
  quality: DecisionQuality;
  compact?: boolean;
}

export default function DecisionQualitySummary({
  quality,
  compact = false,
}: DecisionQualitySummaryProps) {
  if (
    !quality.recommendedAction &&
    !quality.confidence &&
    !quality.decisionScore &&
    !quality.nextMove?.doThisFirst
  ) {
    return null;
  }

  return (
    <div className={`decision-quality-summary${compact ? " compact" : ""}`}>
      {quality.recommendedAction && (
        <div className="dq-row dq-action">
          <span className="dq-label">Recommended Action</span>
          <span className="dq-value">{quality.recommendedAction}</span>
        </div>
      )}

      <div className="dq-badges">
        {quality.confidence && (
          <span className="dq-badge confidence-badge">
            {quality.confidence} confidence
          </span>
        )}
        {quality.decisionScore != null && (
          <span className="dq-badge score-badge">
            Score {quality.decisionScore}/10
          </span>
        )}
        {quality.riskLevel && (
          <span className={`dq-badge risk-badge ${riskBadgeClass(quality.riskLevel)}`}>
            {quality.riskLevel} risk
          </span>
        )}
      </div>

      {quality.nextMove?.doThisFirst && (
        <div className="dq-row dq-next-move">
          <span className="dq-label">Next Move</span>
          <span className="dq-value">{quality.nextMove.doThisFirst}</span>
          {quality.nextMove.timeEstimate && (
            <span className="dq-meta">Est. {quality.nextMove.timeEstimate}</span>
          )}
        </div>
      )}

      {!compact && quality.riskFlags.length > 0 && (
        <ul className="dq-risk-flags-inline">
          {quality.riskFlags.slice(0, 3).map((flag, i) => (
            <li key={i}>{flag}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
