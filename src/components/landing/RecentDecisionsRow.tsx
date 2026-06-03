import type { RunHistorySummary } from "../../types";
import { withIivoWordmark } from "../../utils/brandText";
import RecentDecisionCard from "./RecentDecisionCard";

interface RecentDecisionsRowProps {
  history: RunHistorySummary[];
  onOpenRun: (runId: string) => void;
  onViewAllHistory: () => void;
}

export default function RecentDecisionsRow({
  history,
  onOpenRun,
  onViewAllHistory,
}: RecentDecisionsRowProps) {
  const recent = history.slice(0, 5);

  return (
    <div className="landing-recent-section">
      <div className="landing-recent-header">
        <span className="landing-recent-label">RECENT DECISIONS</span>
        {recent.length > 0 && (
          <button
            type="button"
            className="landing-recent-view-all"
            onClick={onViewAllHistory}
          >
            <span className="landing-recent-view-label">View all</span>
            <span className="landing-recent-view-arrow" aria-hidden="true">
              →
            </span>
          </button>
        )}
      </div>

      {recent.length === 0 ? (
        <p className="landing-recent-empty">
          {withIivoWordmark(
            "No decisions yet — ask IIVO anything below to start your first run.",
            "recent-empty",
          )}
        </p>
      ) : (
        <div className="landing-recent-cards">
          {recent.map((item) => (
            <RecentDecisionCard
              key={item.runId}
              item={item}
              onOpen={() => onOpenRun(item.runId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
