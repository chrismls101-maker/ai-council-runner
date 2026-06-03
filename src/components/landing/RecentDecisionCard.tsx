import {
  displayTitle,
  formatRelativeTime,
  tokenModeLabel,
} from "../../utils/decisionHistory";
import type { RunHistorySummary } from "../../types";

function RecentCardIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 4h10v16H7z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 8h6M9 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface RecentDecisionCardProps {
  item: RunHistorySummary;
  onOpen: () => void;
}

export default function RecentDecisionCard({ item, onOpen }: RecentDecisionCardProps) {
  return (
    <button type="button" className="landing-recent-card" onClick={onOpen}>
      <span className="landing-recent-card-icon">
        <RecentCardIcon />
      </span>
      <span className="landing-recent-card-body">
        <span className="landing-recent-card-title">{displayTitle(item)}</span>
        <span className="landing-recent-card-meta">
          {formatRelativeTime(item.timestamp)}
          {item.tokenMode
            ? ` · ${tokenModeLabel(item.tokenMode)}`
            : item.workflowName
              ? ` · ${item.workflowName}`
              : ""}
        </span>
      </span>
    </button>
  );
}
