import {
  OUTCOME_STATUS_LABELS,
  type OutcomeStatus,
} from "../types/decisionQuality";
import {
  buildClientLearningSummary,
  type DecisionLearningStats,
  type DecisionRecord,
} from "../types/decisionRecord";
import { withIivoWordmark } from "../utils/brandText";
import { formatRelativeTime } from "../utils/decisionHistory";

interface DecisionLearningPanelProps {
  records: DecisionRecord[];
  stats: DecisionLearningStats | null;
  onOpenRun: (runId: string) => void;
  onReview: (record: DecisionRecord) => void;
}

function statusLabel(status: OutcomeStatus): string {
  return OUTCOME_STATUS_LABELS[status] ?? status;
}

export default function DecisionLearningPanel({
  records,
  stats,
  onOpenRun,
  onReview,
}: DecisionLearningPanelProps) {
  return (
    <div className="decision-learning-panel" data-testid="decision-learning-dashboard">
      <header className="panel-section-header">
        <h1>Decision Learning</h1>
        <p className="muted">
          {withIivoWordmark(
            "Track what worked, what did not, and what IIVO should do differently next time.",
            "learning-desc",
          )}
        </p>
      </header>

      {stats && (
        <section className="panel-section learning-stats-grid">
          <div className="learning-stat">
            <strong>{stats.totalDecisions}</strong>
            <span>Total decisions</span>
          </div>
          <div className="learning-stat">
            <strong>{stats.outcomesLogged}</strong>
            <span>Outcomes logged</span>
          </div>
          <div className="learning-stat">
            <strong>{stats.workedCount}</strong>
            <span>Worked</span>
          </div>
          <div className="learning-stat">
            <strong>{stats.didNotWorkCount}</strong>
            <span>Did not work</span>
          </div>
          <div className="learning-stat">
            <strong>{stats.needsRevisionCount}</strong>
            <span>Needs revision</span>
          </div>
          <div className="learning-stat">
            <strong>{stats.withoutOutcomes}</strong>
            <span>Without outcomes</span>
          </div>
        </section>
      )}

      {stats && stats.topProjects.length > 0 && (
        <section className="panel-section">
          <h2>Top projects</h2>
          <ul className="learning-project-list">
            {stats.topProjects.map((p) => (
              <li key={p.name}>
                <span>{p.name}</span>
                <span className="muted">{p.count} decisions</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats && stats.recentLessons.length > 0 && (
        <section className="panel-section">
          <h2>Recent lessons</h2>
          <ul className="learning-lessons-list">
            {stats.recentLessons.map((lesson) => (
              <li key={lesson.recordId}>
                <strong>{lesson.title}</strong>
                <p className="muted">{lesson.lesson}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel-section">
        <h2>Decision records</h2>
        {records.length === 0 ? (
          <p className="muted">No council decision records yet. Run a workflow to create one.</p>
        ) : (
          <ul className="learning-records-list">
            {records.map((record) => (
              <li key={record.id} className="learning-record-card" data-testid="decision-learning-card">
                <div className="learning-record-header">
                  <strong>{record.decisionTitle}</strong>
                  <span className={`inline-badge workflow-badge wf-${record.workflowId}`}>
                    {record.workflowId.replace(/-/g, " ")}
                  </span>
                </div>
                <div className="learning-record-meta muted">
                  {record.projectName && <span>{record.projectName} · </span>}
                  {record.confidence && <span>{record.confidence} confidence · </span>}
                  <span>{statusLabel(record.outcomeStatus)}</span>
                  {record.resultMetric && <span> · {record.resultMetric}</span>}
                </div>
                <p className="learning-record-summary muted">
                  {buildClientLearningSummary(record)}
                </p>
                <div className="learning-record-footer">
                  <span className="muted">{formatRelativeTime(record.updatedAt)}</span>
                  <div className="learning-record-actions">
                    <button
                      type="button"
                      className="btn ghost small btn-action-open"
                      onClick={() => onOpenRun(record.runId)}
                      data-testid="decision-record-open"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      className="btn ghost small btn-action-review"
                      onClick={() => onReview(record)}
                    >
                      Review
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
